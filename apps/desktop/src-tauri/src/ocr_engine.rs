// Purpose: the models a page is read with, loaded once and kept for the life of the app —
// the text detector and recogniser, the layout model, the table model, and, only once a page
// has asked for it, the formula model. ocr.rs runs them; this file only knows how to bring
// them up and where their files are.
//
// The detection parameters are PaddleOCR's own defaults, spelled out because oar-ocr's are
// not: it shrinks a page to 960 px on its long side, which on a 200 dpi scan puts a line of
// body text at eight pixels tall. Dilation and looser thresholds were what fused neighbouring
// lines of dense pages in the measurements (one English textbook went from 0.3% error to
// 5.5%). So: no downscale below 4000 px, no dilation, unclip 1.5, box threshold 0.6.

use crate::ocr_models::{
    DET_FILE, DICT_FILE, FORMULA_FILE, FORMULA_TOKENIZER_FILE, LAYOUT_FILE, REC_FILE,
    TABLE_DICT_FILE, TABLE_FILE,
};
use oar_ocr_core::core::config::OrtSessionConfig;
use oar_ocr_core::domain::tasks::text_detection::TextDetectionConfig;
use oar_ocr_core::predictors::{
    FormulaRecognitionPredictor, LayoutDetectionPredictor, TableStructureRecognitionPredictor,
    TextDetectionPredictor, TextRecognitionPredictor,
};
use oar_ocr_core::processors::LimitType;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Where the measurements were taken; more cores stop helping past that.
const MAX_THREADS: usize = 8;

pub(crate) struct Engine {
    pub det: TextDetectionPredictor,
    pub rec: TextRecognitionPredictor,
    pub layout: LayoutDetectionPredictor,
    pub table: TableStructureRecognitionPredictor,
    /// Loaded on the first page that asks for formulas, never before.
    pub formula: Option<FormulaRecognitionPredictor>,
}

pub(crate) static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

fn threads() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .min(MAX_THREADS)
}

fn session() -> OrtSessionConfig {
    OrtSessionConfig::new().with_intra_threads(threads())
}

/// Where each model's files are: one directory per model, resolved by the caller.
pub(crate) struct ModelDirs {
    pub ocr: PathBuf,
    pub layout: PathBuf,
    pub table: PathBuf,
    pub formula: PathBuf,
}

pub(crate) fn load_engine(dirs: &ModelDirs) -> Result<Engine, String> {
    let det = TextDetectionPredictor::builder()
        .with_config(TextDetectionConfig {
            score_threshold: 0.3,
            box_threshold: 0.6,
            unclip_ratio: 1.5,
            max_candidates: 1000,
            limit_side_len: Some(64),
            limit_type: Some(LimitType::Min),
            max_side_len: Some(crate::ocr::MAX_SIDE),
        })
        .with_ort_config(session())
        .build(dirs.ocr.join(DET_FILE))
        .map_err(|error| error.to_string())?;
    let rec = TextRecognitionPredictor::builder()
        .dict_path(dirs.ocr.join(DICT_FILE))
        .with_ort_config(session())
        .build(dirs.ocr.join(REC_FILE))
        .map_err(|error| error.to_string())?;
    let layout = crate::ocr_layout::load(&dirs.layout.join(LAYOUT_FILE), session())?;
    let table = crate::ocr_table::load(
        &dirs.table.join(TABLE_FILE),
        &dirs.table.join(TABLE_DICT_FILE),
        session(),
    )?;
    Ok(Engine {
        det,
        rec,
        layout,
        table,
        formula: None,
    })
}

pub(crate) fn load_formula(engine: &mut Engine, dir: &Path) -> Result<(), String> {
    if engine.formula.is_none() {
        engine.formula = Some(crate::ocr_formula::load(
            &dir.join(FORMULA_FILE),
            &dir.join(FORMULA_TOKENIZER_FILE),
            session(),
        )?);
    }
    Ok(())
}
