// Purpose: the tests for ocr.rs. The pure parts — the page shapes, the grid, the dedupe, the
// loop check — are tested beside their own files; here are the ones that need the real
// models, `#[ignore]`d and run by hand:
//
//     BREADCRUMB_OCR_MODELS=/data/leo/bench-retrieval/ocr/models/structure \
//         cargo test --lib ocr -- --ignored --nocapture
//
// With that variable set, the layout, table and formula graphs are copied from that directory
// (the text model under its published names, the rest under their pre-publication ones) into
// the temp directory and no network is needed; without it every model is fetched from the
// release. The first test reads the same simulated
// scan of a Chinese textbook the research note measured and prints the character error rate
// against the page's text layer, around 1% for this model; the others read a table page and a
// formula page and print what came back, with the time each stage took.

use super::{read_lines, read_page};
use crate::ocr_engine::{load_engine, load_formula, Engine, ModelDirs};
use crate::ocr_models::{
    DET_FILE, DICT_FILE, FORMULA_FILE, FORMULA_SPEC, FORMULA_TOKENIZER_FILE, LAYOUT_FILE,
    LAYOUT_SPEC, OCR_SPEC, REC_FILE, TABLE_DICT_FILE, TABLE_FILE, TABLE_SPEC,
};

const BENCH: &str = "/data/leo/bench-retrieval/ocr";

/// Levenshtein distance over characters, whitespace removed on both sides — the same measure
/// the research note reports for Chinese pages.
fn character_error_rate(read: &str, truth: &str) -> f64 {
    let strip = |text: &str| -> Vec<char> { text.chars().filter(|c| !c.is_whitespace()).collect() };
    let (a, b) = (strip(read), strip(truth));
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut current = vec![i + 1];
        for (j, cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            current.push(
                (previous[j] + cost)
                    .min(previous[j + 1] + 1)
                    .min(current[j] + 1),
            );
        }
        previous = current;
    }
    previous[b.len()] as f64 / b.len().max(1) as f64
}

#[test]
fn the_error_rate_counts_edits_over_the_truth_length() {
    assert_eq!(character_error_rate("深度 学习", "深度学习"), 0.0);
    assert_eq!(character_error_rate("深度学刁", "深度学习"), 0.25);
    assert_eq!(character_error_rate("", "深度学习"), 1.0);
}

/// Copies a published file from BREADCRUMB_OCR_MODELS under its published name, when the
/// variable names a directory holding it under its original one.
fn local_copy(dir: &std::path::Path, published: &str, original: &str) -> bool {
    let Ok(models) = std::env::var("BREADCRUMB_OCR_MODELS") else {
        return false;
    };
    let source = std::path::Path::new(&models).join(original);
    source.exists() && std::fs::copy(&source, dir.join(published)).is_ok()
}

/// Every model in a temp directory: the text model from the release, the rest from the local
/// directory when there is one, otherwise from their releases too.
fn prepared_dirs(with_formula: bool) -> (ModelDirs, std::path::PathBuf) {
    let root = std::env::temp_dir().join(format!("breadcrumb-ocr-{}", std::process::id()));
    let dirs = ModelDirs {
        ocr: root.join(OCR_SPEC.dir),
        layout: root.join(LAYOUT_SPEC.dir),
        table: root.join(TABLE_SPEC.dir),
        formula: root.join(FORMULA_SPEC.dir),
    };
    for dir in [&dirs.ocr, &dirs.layout, &dirs.table, &dirs.formula] {
        std::fs::create_dir_all(dir).expect("temp dir");
    }
    for file in [DET_FILE, REC_FILE, DICT_FILE] {
        local_copy(&dirs.ocr, file, file);
    }
    local_copy(&dirs.layout, LAYOUT_FILE, "pp-doclayout-m.onnx");
    local_copy(&dirs.table, TABLE_FILE, "slanet_plus.onnx");
    local_copy(&dirs.table, TABLE_DICT_FILE, "table_structure_dict_ch.txt");
    if with_formula {
        local_copy(&dirs.formula, FORMULA_FILE, "pp-formulanet-s.onnx");
        local_copy(
            &dirs.formula,
            FORMULA_TOKENIZER_FILE,
            "pp-formulanet-tokenizer.json",
        );
    }
    let mut specs = vec![
        (&dirs.ocr, &OCR_SPEC),
        (&dirs.layout, &LAYOUT_SPEC),
        (&dirs.table, &TABLE_SPEC),
    ];
    if with_formula {
        specs.push((&dirs.formula, &FORMULA_SPEC));
    }
    for (dir, spec) in specs {
        let sources = crate::model_sources::sources_for(spec);
        tauri::async_runtime::block_on(crate::model_sources::fetch_missing(dir, spec, &sources))
            .expect("the model is there or downloads");
    }
    (dirs, root)
}

pub(super) fn prepared_engine(with_formula: bool) -> (Engine, std::path::PathBuf) {
    let (dirs, root) = prepared_dirs(with_formula);
    let mut engine = load_engine(&dirs).expect("the models load");
    if with_formula {
        load_formula(&mut engine, &dirs.formula).expect("the formula model loads");
    }
    (engine, root)
}

#[test]
#[ignore = "downloads 62 MB and runs the models; run with -- --ignored --nocapture"]
fn the_real_model_reads_a_scanned_textbook_page_at_around_one_percent_error() {
    let (engine, dir) = prepared_engine(false);
    let truth: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(format!("{BENCH}/data/gt.json")).unwrap())
            .unwrap();
    let mut total_edits = 0.0_f64;
    let mut total_chars = 0.0_f64;
    for entry in std::fs::read_dir(format!("{BENCH}/data/zh_dlbook/scan")).expect("bench pages") {
        let path = entry.unwrap().path();
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        let expected = truth[format!("zh_dlbook/{stem}")]
            .as_str()
            .expect("ground truth");
        let page = image::open(&path).expect("page image").to_rgb8();
        let started = std::time::Instant::now();
        let lines = read_lines(&engine, &page).expect("the page reads");
        let text_elapsed = started.elapsed().as_secs_f64();
        let whole = read_page(&engine, &page).expect("the page reads");
        let elapsed = started.elapsed().as_secs_f64() - text_elapsed;
        let read: Vec<String> = lines.into_iter().map(|line| line.text).collect();
        // BREADCRUMB_OCR_DUMP=<file> appends each page's text in the bench's own jsonl shape,
        // so its eval.py can score this run with the same normalisation as every other.
        if let Ok(dump) = std::env::var("BREADCRUMB_OCR_DUMP") {
            let row = serde_json::json!({ "engine": "oar-ocr-v6small", "device": "cpu",
                "set": "zh_dlbook", "variant": "scan", "page": format!("zh_dlbook/{stem}"),
                "sec": started.elapsed().as_secs_f64(), "text": read.join("\n") });
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dump)
                .unwrap();
            writeln!(file, "{row}").unwrap();
        }
        let rate = character_error_rate(&read.join("\n"), expected);
        let chars = expected.chars().filter(|c| !c.is_whitespace()).count() as f64;
        total_edits += rate * chars;
        total_chars += chars;
        println!(
            "{stem}: CER {:.2}% text {text_elapsed:.2}s, text+layout {elapsed:.2}s ({} lines, {} blocks)",
            rate * 100.0,
            read.len(),
            whole.blocks.len()
        );
    }
    let overall = total_edits / total_chars;
    println!(
        "overall CER {:.2}% over {} characters",
        overall * 100.0,
        total_chars
    );
    assert!(
        overall < 0.03,
        "CER {overall:.3} is not the ~1% the model was measured at"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[path = "ocr_tests_pages.rs"]
mod pages;
