// Purpose: the tests for reranker.rs. None of them load the model — what can go wrong here
// without it is the bookkeeping around it: scores getting back into the wrong order, or a
// short result from the model being passed off as a full one. Beside the module because this
// crate holds every source file to the same 200-line ceiling.

use super::{
    scores_in_input_order, MAX_PASSAGES_PER_CALL, MODEL_FILES, ONNX_FILE, RERANKER_MODEL_ID,
};
use fastembed::RerankResult;

fn result(index: usize, score: f32) -> RerankResult {
    RerankResult { document: None, score, index }
}

/// fastembed sorts its results best-first. The caller holds a candidate list in its own order
/// and joins on position, so handing back the sorted order would silently attach every score
/// to the wrong candidate.
#[test]
fn scores_come_back_beside_the_passage_they_belong_to() {
    let sorted_best_first = [result(2, 9.5), result(0, 4.0), result(1, -1.25)];
    let scores = scores_in_input_order(&sorted_best_first, 3).expect("every passage scored");
    assert_eq!(scores, vec![4.0, -1.25, 9.5]);
}

#[test]
fn an_empty_pool_has_an_empty_answer() {
    assert_eq!(scores_in_input_order(&[], 0), Ok(Vec::new()));
}

/// A result list shorter than the pool would otherwise leave some passage holding whatever
/// was in its slot. There is no honest score to invent for it, so the whole call fails and
/// the caller falls back to the vector ranking it already has.
#[test]
fn a_passage_left_unscored_fails_the_whole_call() {
    let missing_the_middle = [result(0, 1.0), result(2, 3.0)];
    assert!(scores_in_input_order(&missing_the_middle, 3).is_err());
}

/// Defensive rather than expected: an index past the pool means the model and this code
/// disagree about what was sent, and guessing which of them is right is not an option.
#[test]
fn a_score_for_a_passage_that_was_never_sent_fails_the_whole_call() {
    assert!(scores_in_input_order(&[result(0, 1.0), result(7, 3.0)], 2).is_err());
}

/// Scores are logits, not probabilities — negative, and unbounded in both directions. Nothing
/// here may clamp or reorder them; the caller compares them and does nothing else.
#[test]
fn negative_scores_pass_through_untouched() {
    let scored = [result(1, -8.0), result(0, -12.5)];
    assert_eq!(scores_in_input_order(&scored, 2), Ok(vec![-12.5, -8.0]));
}

/// The retrieval pool is 50 deep. A cap below that would reject every real call.
#[test]
fn the_pool_this_app_sends_fits_within_the_cap() {
    assert!(MAX_PASSAGES_PER_CALL >= 50);
}

#[test]
fn the_model_identity_names_the_quantized_export() {
    assert_eq!(RERANKER_MODEL_ID, "bge-reranker-v2-m3-int8");
    assert_eq!(
        ONNX_FILE, "model_int8.onnx",
        "the built-in entry for this model is a 2.3 GB fp32 graph; that is the whole reason \
         this file exists. Flat because a release holds no folders, see embeddings.rs"
    );
}

/// The five files fastembed opens for a user-defined reranker: the graph, plus the tokenizer
/// quartet model_files::tokenizer_files reads by name.
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
