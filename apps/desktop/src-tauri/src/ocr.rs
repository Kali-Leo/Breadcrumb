// Purpose: reading a page that has no text layer — a scanned book, a photographed handout,
// a PNG of a slide. Text detection finds the lines and text recognition reads each one; then
// layout detection looks for what is not running text, and a table goes to the table model,
// a formula (when the reader asked for that) to the formula model. Main export: the
// `ocr_page` Tauri command; the models' tables are ocr_models.rs, each stage its own file.
//
// The text models are PaddleOCR's PP-OCRv6 small exports, run through oar-ocr over the same
// onnxruntime fastembed already links. Why this size: measured on the same pages, small reads
// a scanned Chinese textbook at 0.9% character error against tiny's 1.05% and medium's 0.90%,
// at 31 MB against 6 and 139 (docs/research/2026-09-14-OCR方案调研与实测.md). Medium buys
// nothing; small is where more bytes stop helping.
//
// The page arrives as raw RGBA over the IPC's binary channel rather than as JSON: a 200 dpi
// A4 page is fifteen million bytes, not a thing to serialize as an array of numbers.

use crate::model_files::{self, ModelSpec};
use crate::ocr_engine::{load_engine, load_formula, Engine, ModelDirs, ENGINE};
use crate::ocr_layout::RegionKind;
use crate::ocr_models::{DEFAULT_SPECS, FORMULA_SPEC, LAYOUT_SPEC, OCR_SPEC, TABLE_SPEC};
use crate::ocr_page::{OcrLine, OcrPage, PageBox};
use image::RgbImage;
use oar_ocr_core::utils::BBoxCrop;

/// PaddleOCR's `text_recognition.batch_size`. Crops are sorted by width first, so a batch is
/// padded to a neighbour's width rather than to the page's widest line.
const REC_BATCH: usize = 6;
/// The detector's own ceiling; a page bigger than this at 200 dpi is a poster.
pub(crate) const MAX_SIDE: u32 = 4000;

/// Detects, crops, reads. Lines whose crop the recogniser could make nothing of come back as
/// empty strings and are dropped here rather than handed on as blank lines.
pub(crate) fn read_lines(engine: &Engine, page: &RgbImage) -> Result<Vec<OcrLine>, String> {
    let detected = engine
        .det
        .predict(vec![page.clone()])
        .map_err(|error| error.to_string())?;
    let detections = detected.detections.into_iter().flatten();
    let boxes: Vec<_> = detections.map(|d| d.bbox).collect();
    let ordered = crate::ocr_order::reading_order(&boxes);
    let crops: Vec<RgbImage> = BBoxCrop::batch_crop_rotated_bounding_boxes(page, &ordered)
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
            lines[*slot] = Some(OcrLine {
                text,
                score,
                page_box: PageBox::around(&ordered[*slot]),
            });
        }
    }
    Ok(lines
        .into_iter()
        .flatten()
        .filter(|line| !line.text.trim().is_empty())
        .collect())
}

/// The whole page: its lines, then whatever the layout model finds that a table or formula
/// model should read. A page of prose leaves the layout model with nothing to hand on.
/// The lines, then the blocks. A block that cannot be read — a crop the table model refuses,
/// a formula graph that fails on one odd box — costs that block and nothing else: the lines
/// under it are still there, which is what every page got before the block models existed.
/// The lines themselves are the page, and a failure there is the page's failure.
pub(crate) fn read_page(engine: &Engine, page: &RgbImage) -> Result<OcrPage, String> {
    let lines = read_lines(engine, page)?;
    let mut blocks = Vec::new();
    for region in crate::ocr_layout::find_regions(&engine.layout, page)? {
        let block = match region.kind {
            RegionKind::Table => crate::ocr_table::read_table(&engine.table, page, &region, &lines),
            RegionKind::Formula => match &engine.formula {
                Some(formula) => crate::ocr_formula::read_formula(formula, page, &region),
                None => Ok(None),
            },
        };
        blocks.extend(block.unwrap_or_default());
    }
    Ok(OcrPage { lines, blocks })
}

fn ocr_blocking(dirs: ModelDirs, formulas: bool, page: RgbImage) -> Result<OcrPage, String> {
    // Recovered rather than propagated, as in embeddings.rs: one bad page must not leave the
    // engine dead until the app restarts.
    let lock = ENGINE.lock();
    let mut guard = lock.unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        *guard = Some(load_engine(&dirs)?);
    }
    let engine = guard.as_mut().expect("engine initialized above");
    if formulas {
        load_formula(engine, &dirs.formula)?;
    }
    read_page(engine, &page)
}

fn header(request: &tauri::ipc::Request<'_>, name: &str) -> Result<u32, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| format!("{name} header is missing or not a number"))
}

async fn ensure_all(
    app: &tauri::AppHandle,
    specs: &[&ModelSpec],
    allow: bool,
) -> Result<(), String> {
    for spec in specs {
        let dir = model_files::model_dir(app, spec.dir)?;
        model_files::ensure(&dir, spec, allow).await?;
    }
    Ok(())
}

/// Reads one page image: the raw body is RGBA, row-major, `x-width` by `x-height` pixels.
/// The first call downloads the models; `x-allow-download` carries the app's network switch,
/// and nothing is fetched behind a user who turned it off. `x-formulas` says whether the
/// formula model may be fetched and run at all; absent, it may not.
#[tauri::command]
pub async fn ocr_page(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<OcrPage, String> {
    let width = header(&request, "x-width")?;
    let height = header(&request, "x-height")?;
    let allow_download = header(&request, "x-allow-download")? == 1;
    let formulas = header(&request, "x-formulas").unwrap_or(0) == 1;
    let tauri::ipc::InvokeBody::Raw(rgba) = request.body() else {
        return Err("the page must arrive as raw RGBA bytes".into());
    };
    if width == 0 || height == 0 || width.max(height) > MAX_SIDE {
        return Err("page dimensions out of range".into());
    }
    let page = crate::ocr_image::rgba_to_rgb(rgba, width, height)?;
    ensure_all(&app, &DEFAULT_SPECS, allow_download).await?;
    if formulas {
        ensure_all(&app, &[&FORMULA_SPEC], allow_download).await?;
    }
    let dirs = ModelDirs {
        ocr: model_files::model_dir(&app, OCR_SPEC.dir)?,
        layout: model_files::model_dir(&app, LAYOUT_SPEC.dir)?,
        table: model_files::model_dir(&app, TABLE_SPEC.dir)?,
        formula: model_files::model_dir(&app, FORMULA_SPEC.dir)?,
    };
    tauri::async_runtime::spawn_blocking(move || ocr_blocking(dirs, formulas, page))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "ocr_tests.rs"]
mod tests;
