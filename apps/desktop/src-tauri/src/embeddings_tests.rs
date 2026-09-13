// Purpose: the tests for embeddings.rs. Two questions, neither of which needs the model file
// to exist: does the stored vector come out of the truncation correctly formed, and is the
// string the database stamps on it still the one the other edition writes. Beside the module
// rather than inside it because this crate holds every source file to the same 200-line
// ceiling.

use super::{
    truncate_and_renormalize, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID, MODEL_FILES, ONNX_FILE,
};

fn norm(vector: &[f32]) -> f32 {
    vector.iter().map(|value| value * value).sum::<f32>().sqrt()
}

/// A 768-value vector of unit length, of the shape the model actually returns: no two values
/// alike, so slicing it changes its length by an amount a test can notice.
fn model_output() -> Vec<f32> {
    let raw: Vec<f32> = (0..768).map(|index| ((index % 37) as f32) - 18.0).collect();
    let length = norm(&raw);
    raw.iter().map(|value| value / length).collect()
}

/// The literal is duplicated in packages/core-vectors/src/embeddingModel.ts, and a vector
/// written by one edition is read by the other. If the two ever disagree the app cannot tell
/// which model produced a stored row, so this pins the Rust half in place.
#[test]
fn the_model_identity_is_the_string_both_editions_write() {
    assert_eq!(EMBEDDING_MODEL_ID, "gte-multilingual-base-int8-384");
    assert_eq!(EMBEDDING_DIMENSIONS, 384);
    assert!(
        EMBEDDING_MODEL_ID.ends_with(&EMBEDDING_DIMENSIONS.to_string()),
        "the identity names the dimension count, so the two cannot drift apart unnoticed"
    );
}

#[test]
fn a_vector_is_cut_to_the_stored_width() {
    let truncated = truncate_and_renormalize(&model_output());
    assert_eq!(truncated.len(), EMBEDDING_DIMENSIONS);
}

#[test]
fn the_values_kept_are_the_leading_ones() {
    let full = model_output();
    let truncated = truncate_and_renormalize(&full);
    // Same direction, in order — every kept value is the matching one from the front of the
    // model's output, scaled by the one factor that made the head unit length.
    let factor = truncated[1] / full[1];
    for index in 0..EMBEDDING_DIMENSIONS {
        assert!((truncated[index] - full[index] * factor).abs() < 1e-5, "value {index} moved");
    }
}

/// The half that a plain slice would get wrong. The head of a vector normalized over 768
/// values is shorter than unit length; a dot product against it is not cosine similarity
/// until it has been stretched back.
#[test]
fn the_truncated_vector_is_renormalized_and_not_merely_sliced() {
    let full = model_output();
    let sliced_only = &full[..EMBEDDING_DIMENSIONS];
    assert!(
        norm(sliced_only) < 0.99,
        "the fixture has to actually lose length, or this test proves nothing"
    );
    assert!((norm(&truncate_and_renormalize(&full)) - 1.0).abs() < 1e-5);
}

/// Renormalizing is idempotent: a vector that is already the stored width and already unit
/// length comes back untouched, so re-running a migration cannot degrade what it re-reads.
#[test]
fn a_vector_already_of_the_stored_width_survives_unchanged() {
    let once = truncate_and_renormalize(&model_output());
    let twice = truncate_and_renormalize(&once);
    assert_eq!(once.len(), twice.len());
    for (before, after) in once.iter().zip(twice.iter()) {
        assert!((before - after).abs() < 1e-6);
    }
}

/// A shorter vector is kept whole rather than padded: padding would invent a direction, and
/// the caller would rather see a wrong-width vector than a plausible fabricated one.
#[test]
fn a_vector_shorter_than_the_stored_width_is_left_at_its_own_width() {
    let truncated = truncate_and_renormalize(&[3.0, 4.0]);
    assert_eq!(truncated.len(), 2);
    assert!((norm(&truncated) - 1.0).abs() < 1e-6);
}

/// A vector with no length has no direction to restore. Dividing by its norm would make every
/// value NaN, and a NaN vector poisons every comparison it is ever part of.
#[test]
fn a_vector_with_no_direction_is_not_turned_into_nan() {
    let zeroes = truncate_and_renormalize(&vec![0.0_f32; 768]);
    assert_eq!(zeroes.len(), EMBEDDING_DIMENSIONS);
    assert!(zeroes.iter().all(|value| value.is_finite() && *value == 0.0));
    assert!(truncate_and_renormalize(&[]).is_empty());
}

/// The five files fastembed opens for a user-defined model: the graph, plus the tokenizer
/// quartet model_files::tokenizer_files reads by name. Losing one from this table would mean
/// downloading four files and then failing to load, offline, with no way to recover.
#[test]
fn the_download_table_lists_every_file_the_model_is_loaded_from() {
    let names: Vec<&str> = MODEL_FILES.iter().map(|file| file.name).collect();
    assert_eq!(
        names,
        vec![
            ONNX_FILE,
            "tokenizer.json",
            "config.json",
            "special_tokens_map.json",
            "tokenizer_config.json"
        ]
    );
    assert_eq!(
        ONNX_FILE, "onnx/model_int8.onnx",
        "the fp32 graph is not what this app ships, and the subfolder is what the browser \
         edition looks in — flattening it breaks the other edition, not this one"
    );
}

/// A download is refused unless it is exactly this long and hashes to exactly this, so a
/// table entry left blank or mistyped does not weaken the check — it stops the model being
/// downloadable at all, offline, with no way for anyone to recover. The half-filled table is
/// the one that would slip past review, so nothing here is allowed to be absent.
#[test]
fn every_file_is_pinned_to_a_size_and_a_well_formed_digest() {
    for file in &MODEL_FILES {
        assert!(file.bytes > 0, "{} has no recorded size", file.name);
        assert_eq!(file.sha256.len(), 64, "{} has no SHA-256", file.name);
        assert!(
            file.sha256.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()),
            "{} has something that is not a lowercase hex digest",
            file.name
        );
    }
    let digests: std::collections::HashSet<&str> =
        MODEL_FILES.iter().map(|file| file.sha256).collect();
    assert_eq!(digests.len(), MODEL_FILES.len(), "one digest was pasted twice");
}
