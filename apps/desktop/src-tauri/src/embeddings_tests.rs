// Purpose: the tests for embeddings.rs — specifically for the question the network switch
// rests on, "is the model already here". Beside the module rather than inside it because this
// crate holds every source file to the same 200-line ceiling, and answering that question
// honestly takes a handful of cache directories built by hand.

use super::{model_is_cached, MODEL_REPO_DIR, REQUIRED_MODEL_FILES};
use fastembed::{EmbeddingModel, TextEmbedding};

struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir()
            .join(format!("breadcrumb-cache-{}-{name}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).expect("temp dir");
        Self(dir)
    }

    fn write(&self, relative: &str, bytes: &[u8]) {
        let path = self.0.join(relative);
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("dirs");
        std::fs::write(path, bytes).expect("write");
    }

    fn snapshot(&self) -> String {
        format!("{MODEL_REPO_DIR}/snapshots/abc123")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

/// The names above are a copy of what fastembed asks hf-hub for. If a version bump changes
/// the repository or the model file, the guard would start answering "not cached" forever
/// and every embedding call would refuse while the network switch was off.
#[test]
fn the_model_this_app_asks_for_is_the_one_these_names_describe() {
    let info = TextEmbedding::get_model_info(&EmbeddingModel::MultilingualE5Small)
        .expect("fastembed should know this model");
    assert_eq!(
        MODEL_REPO_DIR,
        format!("models--{}", info.model_code.replace('/', "--")),
        "fastembed now downloads a different repository"
    );
    assert!(REQUIRED_MODEL_FILES.contains(&info.model_file.as_str()));
    assert!(info.additional_files.is_empty(), "fastembed now needs files this list omits");
}

#[test]
fn an_empty_cache_is_not_cached() {
    let scratch = Scratch::new("empty");
    assert!(!model_is_cached(&scratch.0));
}

/// The bug, exactly as it happened: hf-hub makes the blob directory before it downloads,
/// so an interrupted first run leaves a cache that looks populated and holds nothing.
#[test]
fn a_download_that_was_interrupted_does_not_count_as_cached() {
    let scratch = Scratch::new("half");
    scratch.write(&format!("{MODEL_REPO_DIR}/blobs/9f2c.part"), b"partial");
    assert!(!model_is_cached(&scratch.0));
}

/// Nor does a cache with some other model in it, which the old directory-exists test
/// accepted just as readily.
#[test]
fn another_model_in_the_cache_does_not_count_as_cached() {
    let scratch = Scratch::new("other");
    scratch.write("models--someone--something-else/snapshots/a/onnx/model.onnx", b"x");
    assert!(!model_is_cached(&scratch.0));
}

#[test]
fn every_file_the_model_needs_has_to_be_there() {
    let scratch = Scratch::new("partial");
    let snapshot = scratch.snapshot();
    for name in REQUIRED_MODEL_FILES.iter().skip(1) {
        scratch.write(&format!("{snapshot}/{name}"), b"{}");
    }
    assert!(!model_is_cached(&scratch.0), "the ONNX graph itself is missing");
    scratch.write(&format!("{snapshot}/{}", REQUIRED_MODEL_FILES[0]), b"onnx");
    assert!(model_is_cached(&scratch.0));
}

/// A file truncated to nothing (a disk that filled up mid-write) is not a model either.
#[test]
fn an_empty_file_is_not_a_downloaded_file() {
    let scratch = Scratch::new("truncated");
    let snapshot = scratch.snapshot();
    for name in REQUIRED_MODEL_FILES {
        scratch.write(&format!("{snapshot}/{name}"), b"{}");
    }
    scratch.write(&format!("{snapshot}/tokenizer.json"), b"");
    assert!(!model_is_cached(&scratch.0));
}
