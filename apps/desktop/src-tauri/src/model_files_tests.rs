// Purpose: the tests for model_files.rs — the two things the module promises and the app
// depends on: that a half-finished download never passes for a cached model, and that the
// network switch is answered before any request is built. Beside the module because this
// crate holds every source file to the same 200-line ceiling, and asking those questions
// honestly takes a few cache directories built by hand.

use super::{
    is_cached, is_complete_file, model_base_url, ModelFile, DEFAULT_MODEL_BASE_URL,
    MODEL_BASE_URL_ENV,
};

/// Stand-ins for a real table. The size and digest matter only to a download, which none of
/// these tests performs; what is being asked here is where the files sit and whether they
/// look finished. The graph is one level down, exactly as it is in both real tables.
const FILES: [ModelFile; 2] = [
    ModelFile { name: "onnx/model_int8.onnx", bytes: 7, sha256: "" },
    ModelFile { name: "tokenizer.json", bytes: 7, sha256: "" },
];

struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "breadcrumb-models-{}-{name}",
            std::process::id()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).expect("temp dir");
        Self(dir)
    }

    fn write(&self, relative: &str, bytes: &[u8]) {
        let path = self.0.join(relative);
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("dirs");
        std::fs::write(path, bytes).expect("write");
    }

    fn complete(&self) {
        for file in FILES {
            self.write(file.name, b"content");
        }
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

#[test]
fn an_empty_directory_is_not_a_cached_model() {
    let scratch = Scratch::new("empty");
    assert!(!is_cached(&scratch.0, &FILES));
}

#[test]
fn every_file_the_model_needs_has_to_be_there() {
    let scratch = Scratch::new("partial");
    scratch.write(FILES[1].name, b"{}");
    assert!(!is_cached(&scratch.0, &FILES), "the ONNX graph itself is missing");
    scratch.write(FILES[0].name, b"content");
    assert!(is_cached(&scratch.0, &FILES));
}

/// The bug this whole scheme exists to prevent, in its new form: a download stopped partway
/// leaves a `.part`, and if that read as "cached" the network switch would be bypassed on the
/// next call — which is the one promise the switch makes.
#[test]
fn a_download_that_was_interrupted_does_not_count_as_cached() {
    let scratch = Scratch::new("half");
    scratch.complete();
    scratch.write("onnx/model_int8.onnx.part", b"partial");
    assert!(!is_complete_file(&scratch.0.join("onnx/model_int8.onnx")));
    assert!(!is_cached(&scratch.0, &FILES));
}

/// A file truncated to nothing — a disk that filled up mid-write — is not a model either.
#[test]
fn an_empty_file_is_not_a_downloaded_file() {
    let scratch = Scratch::new("truncated");
    scratch.complete();
    scratch.write(FILES[0].name, b"");
    assert!(!is_complete_file(&scratch.0.join(FILES[0].name)));
    assert!(!is_cached(&scratch.0, &FILES));
}

/// With the switch off and something missing, the answer is an error. The refusal comes
/// before the HTTP client is even built, which is what makes "zero requests" true rather than
/// merely likely; the second half checks the switch does not also block an offline app.
#[test]
fn the_network_switch_is_answered_before_anything_is_fetched() {
    let scratch = Scratch::new("switch");
    let refused = tauri::async_runtime::block_on(super::ensure(
        &scratch.0,
        "gte-multilingual-base",
        &FILES,
        false,
    ));
    assert!(refused.is_err(), "a missing model must not be fetched behind the switch");
    scratch.complete();
    let allowed = tauri::async_runtime::block_on(super::ensure(
        &scratch.0,
        "gte-multilingual-base",
        &FILES,
        false,
    ));
    assert!(allowed.is_ok(), "a cached model must work with the switch off");
}

/// One test rather than several: these all read and write the same process-wide variable, and
/// the test harness runs tests on threads that share it.
#[test]
fn the_base_url_can_be_overridden_from_the_environment() {
    std::env::remove_var(MODEL_BASE_URL_ENV);
    assert_eq!(model_base_url(), DEFAULT_MODEL_BASE_URL);
    assert!(DEFAULT_MODEL_BASE_URL.ends_with('/'));

    std::env::set_var(MODEL_BASE_URL_ENV, "http://127.0.0.1:8788/packs/");
    assert_eq!(model_base_url(), "http://127.0.0.1:8788/packs/");

    // A base written without the trailing slash still joins correctly.
    std::env::set_var(MODEL_BASE_URL_ENV, "http://127.0.0.1:8788/packs");
    assert_eq!(model_base_url(), "http://127.0.0.1:8788/packs/");

    // An empty setting is someone unsetting it awkwardly, not a request for an empty host.
    std::env::set_var(MODEL_BASE_URL_ENV, "   ");
    assert_eq!(model_base_url(), DEFAULT_MODEL_BASE_URL);
    std::env::remove_var(MODEL_BASE_URL_ENV);
}
