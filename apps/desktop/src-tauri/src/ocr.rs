// Purpose: reading the text off a page that has none — a scanned book, a photographed handout,
// a PNG of a slide. Text detection finds the lines, text recognition reads each one, and the
// lines come back in reading order. Main export: the `ocr_page` Tauri command.
//
// The models are PaddleOCR's own PP-OCRv6 small exports, run through oar-ocr over the same
// onnxruntime fastembed already links. Why this size: measured on the same pages, small reads
// a scanned Chinese textbook at 0.9% character error against tiny's 1.05% and medium's 0.90%,
// at 31 MB against 6 and 139 (docs/research/2026-09-14-OCR方案调研与实测.md). Medium buys
// nothing; small is where more bytes stop helping.
//
// The detection parameters are PaddleOCR's own defaults, spelled out because oar-ocr's are
// not: it shrinks a page to 960 px on its long side, which on a 200 dpi scan puts a line of
// body text at eight pixels tall. Dilation and looser thresholds were what fused neighbouring
// lines of dense pages in the measurements (one English textbook went from 0.3% error to
// 5.5%). So: no downscale below 4000 px, no dilation, unclip 1.5, box threshold 0.6.
//
// The page arrives as raw RGBA over the IPC's binary channel rather than as JSON: a 200 dpi
// A4 page is fifteen million bytes, not a thing to serialize as an array of numbers.

use crate::model_files::{self, ModelFile, ModelSpec};
use image::RgbImage;
use oar_ocr_core::core::config::OrtSessionConfig;
use oar_ocr_core::domain::tasks::text_detection::TextDetectionConfig;
use oar_ocr_core::predictors::{TextDetectionPredictor, TextRecognitionPredictor};
use oar_ocr_core::processors::LimitType;
use oar_ocr_core::utils::BBoxCrop;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const LOCAL_DIR: &str = "pp-ocrv6-small";
/// The GitHub release its files are downloaded from, and the git tag the mirror's copy is
/// pinned to. The browser edition runs the tiny pair under its own tag (apps/web ocrModel.ts).
const RELEASE_TAG: &str = "pp-ocrv6-small-v1";
const DET_FILE: &str = "PP-OCRv6_small_det.onnx";
const REC_FILE: &str = "PP-OCRv6_small_rec.onnx";
/// One character per line, lifted from the `inference.yml` PaddleOCR ships with the graph.
const DICT_FILE: &str = "PP-OCRv6_small_rec_dict.txt";

/// Measured from PaddleOCR's `PP-OCRv6_small_{det,rec}_onnx_infer.tar` (paddle3.0.0).
pub(crate) const MODEL_FILES: [ModelFile; 3] = [
    ModelFile {
        name: DET_FILE,
        bytes: 9_880_512,
        sha256: "d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e",
    },
    ModelFile {
        name: REC_FILE,
        bytes: 21_159_378,
        sha256: "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634",
    },
    ModelFile {
        name: DICT_FILE,
        bytes: 74_947,
        sha256: "b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d",
    },
];

pub(crate) const SPEC: ModelSpec = ModelSpec {
    dir: LOCAL_DIR,
    release: RELEASE_TAG,
    files: &MODEL_FILES,
};

/// PaddleOCR's `text_recognition.batch_size`. Crops are sorted by width first, so a batch is
/// padded to a neighbour's width rather than to the page's widest line.
const REC_BATCH: usize = 6;
/// The detector's own ceiling; a page bigger than this at 200 dpi is a poster.
const MAX_SIDE: u32 = 4000;
/// Where the measurements were taken; more cores stop helping past that.
const MAX_THREADS: usize = 8;

/// One recognised line of text, in reading order.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct OcrLine {
    pub text: String,
    pub score: f32,
}

pub(crate) struct Engine {
    det: TextDetectionPredictor,
    rec: TextRecognitionPredictor,
}

static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

fn threads() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .min(MAX_THREADS)
}

pub(crate) fn load_engine(dir: &Path) -> Result<Engine, String> {
    let session = OrtSessionConfig::new().with_intra_threads(threads());
    let det = TextDetectionPredictor::builder()
        .with_config(TextDetectionConfig {
            score_threshold: 0.3,
            box_threshold: 0.6,
            unclip_ratio: 1.5,
            max_candidates: 1000,
            limit_side_len: Some(64),
            limit_type: Some(LimitType::Min),
            max_side_len: Some(MAX_SIDE),
        })
        .with_ort_config(session.clone())
        .build(dir.join(DET_FILE))
        .map_err(|error| error.to_string())?;
    let rec = TextRecognitionPredictor::builder()
        .dict_path(dir.join(DICT_FILE))
        .with_ort_config(session)
        .build(dir.join(REC_FILE))
        .map_err(|error| error.to_string())?;
    Ok(Engine { det, rec })
}

/// Detects, crops, reads. Lines whose crop the recogniser could make nothing of come back as
/// empty strings and are dropped here rather than handed on as blank lines.
pub(crate) fn read_page(engine: &Engine, page: RgbImage) -> Result<Vec<OcrLine>, String> {
    let detected = engine
        .det
        .predict(vec![page.clone()])
        .map_err(|error| error.to_string())?;
    let detections = detected.detections.into_iter().flatten();
    let boxes: Vec<_> = detections.map(|d| d.bbox).collect();
    let ordered = crate::ocr_order::reading_order(&boxes);
    let crops: Vec<RgbImage> = BBoxCrop::batch_crop_rotated_bounding_boxes(&page, &ordered)
        .into_iter()
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    // Wide lines with wide lines: a batch is padded to its widest member.
    let mut order: Vec<usize> = (0..crops.len()).collect();
    let ratio = |crop: &RgbImage| crop.width() as f32 / crop.height().max(1) as f32;
    order.sort_by(|a, b| ratio(&crops[*a]).total_cmp(&ratio(&crops[*b])));
    let mut lines: Vec<Option<OcrLine>> = vec![None; crops.len()];
    for batch in order.chunks(REC_BATCH) {
        let images = batch.iter().map(|index| crops[*index].clone()).collect();
        let read = engine
            .rec
            .predict(images)
            .map_err(|error| error.to_string())?;
        for (slot, (text, score)) in batch.iter().zip(read.texts.into_iter().zip(read.scores)) {
            lines[*slot] = Some(OcrLine { text, score });
        }
    }
    Ok(lines
        .into_iter()
        .flatten()
        .filter(|line| !line.text.trim().is_empty())
        .collect())
}

fn ocr_blocking(dir: PathBuf, page: RgbImage) -> Result<Vec<OcrLine>, String> {
    // Recovered rather than propagated, as in embeddings.rs: one bad page must not leave the
    // engine dead until the app restarts.
    let lock = ENGINE.lock();
    let mut guard = lock.unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        *guard = Some(load_engine(&dir)?);
    }
    read_page(guard.as_ref().expect("engine initialized above"), page)
}

fn header(request: &tauri::ipc::Request<'_>, name: &str) -> Result<u32, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| format!("{name} header is missing or not a number"))
}

/// Reads one page image: the raw body is RGBA, row-major, `x-width` by `x-height` pixels.
/// The first call downloads the model; `x-allow-download` carries the app's network switch,
/// and nothing is fetched behind a user who turned it off.
#[tauri::command]
pub async fn ocr_page(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Vec<OcrLine>, String> {
    let width = header(&request, "x-width")?;
    let height = header(&request, "x-height")?;
    let allow_download = header(&request, "x-allow-download")? == 1;
    let tauri::ipc::InvokeBody::Raw(rgba) = request.body() else {
        return Err("the page must arrive as raw RGBA bytes".into());
    };
    if width == 0 || height == 0 || width.max(height) > MAX_SIDE {
        return Err("page dimensions out of range".into());
    }
    let page = crate::ocr_image::rgba_to_rgb(rgba, width, height)?;
    let dir = model_files::model_dir(&app, LOCAL_DIR)?;
    model_files::ensure(&dir, &SPEC, allow_download).await?;
    tauri::async_runtime::spawn_blocking(move || ocr_blocking(dir, page))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "ocr_tests.rs"]
mod tests;
