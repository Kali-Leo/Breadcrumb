// Purpose: the download tables for everything that reads a scanned page — which files, how
// many bytes, which digest, which release. Four models, one table each, in the same shape the
// embedder's uses (model_files.rs), so every one is fetched, checked and cached by the same
// code and none of them can be trusted on the strength of a manifest.
//
// Three are default-on and arrive together on the first scanned page: PP-OCRv6 small reads
// the text (31 MB), PP-DocLayout-M finds tables and formulas on it (23 MB, 33 ms a page),
// SLANet_plus reads a table's structure (8 MB, 0.1 s a table). The fourth, PP-FormulaNet-S,
// is 232 MB and is fetched only when the reader has asked for formulas to be read
// (docs/research/2026-09-15-公式与表格识别实测.md has the measurements behind each choice).
//
// Every entry is measured from the file as published; a blank entry makes a model
// undownloadable rather than unchecked.

use crate::model_files::{ModelFile, ModelSpec};

pub const OCR_DIR: &str = "pp-ocrv6-small";
pub const DET_FILE: &str = "PP-OCRv6_small_det.onnx";
pub const REC_FILE: &str = "PP-OCRv6_small_rec.onnx";
/// One character per line, lifted from the `inference.yml` PaddleOCR ships with the graph.
pub const DICT_FILE: &str = "PP-OCRv6_small_rec_dict.txt";

/// Measured from PaddleOCR's `PP-OCRv6_small_{det,rec}_onnx_infer.tar` (paddle3.0.0).
pub const OCR_FILES: [ModelFile; 3] = [
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

pub const OCR_SPEC: ModelSpec = ModelSpec {
    dir: OCR_DIR,
    release: "pp-ocrv6-small-v1",
    files: &OCR_FILES,
};

pub const LAYOUT_DIR: &str = "pp-doclayout-m";
pub const LAYOUT_FILE: &str = "PP-DocLayout-M.onnx";

/// PaddleOCR's own ONNX export of PP-DocLayout-M, unchanged.
pub const LAYOUT_FILES: [ModelFile; 1] = [ModelFile {
    name: LAYOUT_FILE,
    bytes: 23_496_727,
    sha256: "8e458bfc919bbf7a35be9802485b5cd30151cb356364cfad09911d2ee1fc1f76",
}];

pub const LAYOUT_SPEC: ModelSpec = ModelSpec {
    dir: LAYOUT_DIR,
    release: "pp-doclayout-m-v1",
    files: &LAYOUT_FILES,
};

pub const TABLE_DIR: &str = "slanet-plus";
pub const TABLE_FILE: &str = "SLANet_plus.onnx";
/// The structure tokens the model emits, one per line — PaddleOCR's `table_structure_dict_ch`.
pub const TABLE_DICT_FILE: &str = "SLANet_plus_dict.txt";

pub const TABLE_FILES: [ModelFile; 2] = [
    ModelFile {
        name: TABLE_FILE,
        bytes: 7_782_138,
        sha256: "3a96a71719247c5d94992fca31266b598c54740388de371f0c75077e2a9e0b55",
    },
    ModelFile {
        name: TABLE_DICT_FILE,
        bytes: 578,
        sha256: "68d344a84b726e043f390122240ff2b2ced2949b2a80ce9b61ae955054d190ef",
    },
];

pub const TABLE_SPEC: ModelSpec = ModelSpec {
    dir: TABLE_DIR,
    release: "slanet-plus-v1",
    files: &TABLE_FILES,
};

pub const FORMULA_DIR: &str = "pp-formulanet-s";
pub const FORMULA_FILE: &str = "PP-FormulaNet-S.onnx";
pub const FORMULA_TOKENIZER_FILE: &str = "PP-FormulaNet-S_tokenizer.json";

pub const FORMULA_FILES: [ModelFile; 2] = [
    ModelFile {
        name: FORMULA_FILE,
        bytes: 231_878_904,
        sha256: "0ee32c7bfbd9e586364f89f71860476ccb5334e35674a61f3df5e0553d6a6dcc",
    },
    ModelFile {
        name: FORMULA_TOKENIZER_FILE,
        bytes: 2_140_014,
        sha256: "2811d82701ec97c192fa256aa2b4516929373870ae660326cc5b1dc879b95ff2",
    },
];

pub const FORMULA_SPEC: ModelSpec = ModelSpec {
    dir: FORMULA_DIR,
    release: "pp-formulanet-s-v1",
    files: &FORMULA_FILES,
};

/// The models a page is read with by default, in the order they are fetched.
pub const DEFAULT_SPECS: [&ModelSpec; 3] = [&OCR_SPEC, &LAYOUT_SPEC, &TABLE_SPEC];

#[cfg(test)]
mod tests {
    use super::*;

    /// Same rule as the embedder's table: a blank or mistyped entry does not weaken the check,
    /// it makes the model undownloadable, so every entry has to be filled in.
    #[test]
    fn every_file_of_every_model_is_pinned_to_a_size_and_a_well_formed_digest() {
        let mut digests = std::collections::HashSet::new();
        for spec in DEFAULT_SPECS.iter().chain([&&FORMULA_SPEC]) {
            for ModelFile {
                name,
                bytes,
                sha256,
            } in spec.files
            {
                assert!(*bytes > 0, "{name} has no recorded size");
                assert_eq!(sha256.len(), 64, "{name} has no SHA-256");
                assert!(sha256
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()));
                assert!(digests.insert(*sha256), "{name}'s digest was pasted twice");
            }
        }
    }

    #[test]
    fn each_model_has_its_own_release_and_directory() {
        let specs = [&OCR_SPEC, &LAYOUT_SPEC, &TABLE_SPEC, &FORMULA_SPEC];
        let releases: std::collections::HashSet<&str> = specs.iter().map(|s| s.release).collect();
        let dirs: std::collections::HashSet<&str> = specs.iter().map(|s| s.dir).collect();
        assert_eq!(releases.len(), 4);
        assert_eq!(dirs.len(), 4);
        assert_eq!(FORMULA_SPEC.release, "pp-formulanet-s-v1");
        assert_eq!(LAYOUT_SPEC.release, "pp-doclayout-m-v1");
        assert_eq!(TABLE_SPEC.release, "slanet-plus-v1");
    }
}
