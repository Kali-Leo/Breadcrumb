// Purpose: the tests for model_download.rs — the verdict on a body that has fully arrived.
// Beside the module because this crate holds every source file to the same 200-line ceiling,
// and because the verdict is the half worth testing without a server in front of it.

use super::{hex, size_complaint, verify, ModelFile};

/// The real tables record both; these stand in for one entry of one.
const EXPECTED: &str = "1601d9f73a0cc323d4ec6277f77111c528dc6bdaf4da5c4326e74dbaaa02cad6";

fn file() -> ModelFile {
    ModelFile {
        name: "model_int8.onnx",
        bytes: 310_821_344,
        sha256: EXPECTED,
    }
}

#[test]
fn a_body_of_the_recorded_length_and_digest_is_kept() {
    assert!(verify(&file(), 310_821_344, EXPECTED.to_string()).is_ok());
}

/// Exact, not a floor. A body one byte short is a download that stopped, and a body longer
/// than recorded is not the file this table is describing at all.
#[test]
fn a_body_of_any_other_length_is_refused() {
    assert!(verify(&file(), 310_821_343, EXPECTED.to_string()).is_err());
    assert!(verify(&file(), 310_821_345, EXPECTED.to_string()).is_err());
    assert!(verify(&file(), 0, EXPECTED.to_string()).is_err());
}

/// The case the size check alone cannot see: something exactly as long as the model and not
/// the model. Nothing about this is a warning — the caller deletes what it just wrote.
#[test]
fn a_body_of_the_right_length_and_the_wrong_contents_is_refused() {
    assert!(verify(&file(), 310_821_344, "0".repeat(64)).is_err());
}

/// Digests get written down in either case, and a table pasted from a tool that shouts is
/// not a reason to refuse a model that is byte-for-byte correct.
#[test]
fn a_digest_is_compared_without_regard_to_case() {
    assert!(verify(&file(), 310_821_344, EXPECTED.to_uppercase()).is_ok());
}

/// Says what was expected and what turned up, because the same sentence has to make sense
/// whether it came from Content-Length before the download or from the bytes after it.
#[test]
fn the_size_complaint_names_both_numbers() {
    let complaint = size_complaint(file().name, file().bytes, 1024);
    assert!(complaint.contains("310821344"));
    assert!(complaint.contains("1024"));
    assert!(complaint.contains("model_int8.onnx"));
}

#[test]
fn hex_renders_a_digest_the_way_the_tables_record_one() {
    assert_eq!(hex(&[0x00, 0x0f, 0xa9, 0xff]), "000fa9ff");
}
