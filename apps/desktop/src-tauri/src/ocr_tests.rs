// Purpose: the tests for ocr.rs. The download table is pinned the way the embedder's is, and
// one test — `#[ignore]`d, run by hand — downloads the real model and reads a real page:
//
//     cargo test --lib ocr -- --ignored --nocapture
//
// It fetches 31 MB into a temp directory, runs the same simulated scan of a Chinese textbook
// page the research note measured (/data/leo/bench-retrieval/ocr), and prints the character
// error rate against the page's text layer. The note's figure for this model is around 1%
// on that set; the assertion below leaves room for the odd page but not for a broken
// pipeline, which reads at 30% or worse.

use super::{load_engine, read_page, MODEL_FILES, SPEC};
use crate::model_files::ModelFile;

const BENCH: &str = "/data/leo/bench-retrieval/ocr";

#[test]
fn the_download_table_names_the_detector_the_recogniser_and_its_dictionary() {
    let names: Vec<&str> = MODEL_FILES.iter().map(|file| file.name).collect();
    assert_eq!(
        names,
        vec![
            "PP-OCRv6_small_det.onnx",
            "PP-OCRv6_small_rec.onnx",
            "PP-OCRv6_small_rec_dict.txt"
        ]
    );
    assert_eq!(SPEC.release, "pp-ocrv6-small-v1");
    assert_eq!(SPEC.dir, "pp-ocrv6-small");
}

/// Same rule as the embedder's table: a blank or mistyped entry does not weaken the check, it
/// makes the model undownloadable, so every entry has to be filled in.
#[test]
fn every_file_is_pinned_to_a_size_and_a_well_formed_digest() {
    for ModelFile {
        name,
        bytes,
        sha256,
    } in &MODEL_FILES
    {
        assert!(*bytes > 0, "{name} has no recorded size");
        assert_eq!(sha256.len(), 64, "{name} has no SHA-256");
        assert!(sha256
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()));
    }
    let digests: std::collections::HashSet<&str> =
        MODEL_FILES.iter().map(|file| file.sha256).collect();
    assert_eq!(
        digests.len(),
        MODEL_FILES.len(),
        "one digest was pasted twice"
    );
}

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

#[test]
#[ignore = "downloads 31 MB and runs the model; run with -- --ignored --nocapture"]
fn the_real_model_reads_a_scanned_textbook_page_at_around_one_percent_error() {
    let dir = std::env::temp_dir().join(format!("breadcrumb-ocr-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let sources = crate::model_sources::sources_for(&SPEC);
    tauri::async_runtime::block_on(crate::model_sources::fetch_missing(&dir, &SPEC, &sources))
        .expect("the model downloads");
    let engine = load_engine(&dir).expect("the model loads");

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
        let lines = read_page(&engine, page).expect("the page reads");
        let elapsed = started.elapsed().as_secs_f64();
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
            "{stem}: CER {:.2}% in {elapsed:.2}s ({} lines)",
            rate * 100.0,
            read.len()
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
