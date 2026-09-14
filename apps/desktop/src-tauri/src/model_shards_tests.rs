// Purpose: the tests for model_shards.rs — that a manifest is matched to a table entry by
// all three of name, length and digest, and that the pieces come out in the order they went
// in. Beside the module because this crate holds every source file to the same 200-line
// ceiling. Fetching is not tested here: the manifest is a few hundred bytes of JSON and the
// only thing that could go wrong on the wire is what model_sources_tests.rs exercises.

use super::Manifest;
use crate::model_files::ModelFile;

const DIGEST: &str = "1601d9f73a0cc323d4ec6277f77111c528dc6bdaf4da5c4326e74dbaaa02cad6";
const GRAPH: ModelFile = ModelFile {
    name: "model_int8.onnx",
    bytes: 6,
    sha256: DIGEST,
};

/// The shape the publishing script writes, verbatim but for the numbers.
fn manifest(file: &str, bytes: u64, sha256: &str) -> Manifest {
    serde_json::from_str(&format!(
        r#"{{"file":"{file}","bytes":{bytes},"sha256":"{sha256}",
            "shards":[{{"name":"onnx/model_int8.onnx.000","bytes":4}},
                      {{"name":"onnx/model_int8.onnx.001","bytes":2}}]}}"#
    ))
    .expect("a well-formed manifest")
}

/// The browser edition's path has a folder in front; the desktop table's name does not. The
/// match is on the file, not on where each edition keeps it.
#[test]
fn a_manifest_describes_the_file_it_names_whatever_folder_it_is_under() {
    assert!(manifest("onnx/model_int8.onnx", 6, DIGEST).describes(&GRAPH));
    assert!(manifest("model_int8.onnx", 6, DIGEST).describes(&GRAPH));
    assert!(manifest("onnx/model_int8.onnx", 6, &DIGEST.to_uppercase()).describes(&GRAPH));
}

/// A manifest for a different set of bytes — a newer export under the same name, or another
/// model's graph — is refused before a piece is asked for, not after 311 MB of them.
#[test]
fn a_manifest_for_other_bytes_does_not_describe_the_file() {
    assert!(!manifest("onnx/model_int8.onnx", 7, DIGEST).describes(&GRAPH));
    assert!(!manifest("onnx/model_int8.onnx", 6, &"0".repeat(64)).describes(&GRAPH));
    assert!(!manifest("onnx/model_fp32.onnx", 6, DIGEST).describes(&GRAPH));
    let other = ModelFile {
        name: "tokenizer.json",
        ..GRAPH
    };
    assert!(!manifest("onnx/model_int8.onnx", 6, DIGEST).describes(&other));
}

#[test]
fn the_pieces_are_urls_under_the_base_in_manifest_order() {
    let pieces = manifest("onnx/model_int8.onnx", 6, DIGEST).pieces("https://cdn/x/");
    assert_eq!(
        pieces,
        vec![
            ("https://cdn/x/onnx/model_int8.onnx.000".to_string(), 4),
            ("https://cdn/x/onnx/model_int8.onnx.001".to_string(), 2),
        ]
    );
}
