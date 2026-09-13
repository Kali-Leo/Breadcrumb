// Purpose: cross-encoder reranking of retrieval candidates — bge-reranker-v2-m3, int8 ONNX.
// Main export: the `rerank_pairs` Tauri command.
//
// fastembed does know this model, and its built-in entry downloads a 2.3 GB fp32 graph. That
// is not something to hand a laptop for a search box, so this takes the same "bring your own
// model" route the embedder takes, over our own int8 export, through the same download and
// network-switch machinery in model_files.rs.
//
// Two shapes here are deliberate and easy to undo by accident. Scores come back in the order
// the passages were sent, not sorted, because the caller is holding a candidate list of its
// own and needs to join the scores back onto it; sorting here would force it to match on text.
// And every failure is a plain string: the caller treats reranking as an optional improvement
// on the vector ranking and drops it silently, so nothing in this file may panic.
//
// Unlike the embedder, this export is genuinely dynamically quantized — activations and all.
// XLM-R's feed-forward is a plain GELU with no gate, so it has none of the outlier channels
// that made dynamic quantization unusable for gte; here it holds rank correlation at 0.9979
// against fp32 and runs 2.5x faster than the weight-only alternative. Two models, opposite
// answers, and neither one is a precedent for the other.

use crate::model_files::{self, ModelFile};
use fastembed::{RerankInitOptionsUserDefined, RerankResult, TextRerank, UserDefinedRerankingModel};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static MODEL: Mutex<Option<TextRerank>> = Mutex::new(None);

/// The reranking pool is the top 50 of the vector search. The cap sits a little above that so
/// a caller widening the pool slightly is not rejected, and far enough below anything that
/// would make one call run for minutes.
const MAX_PASSAGES_PER_CALL: usize = 64;
/// A search query, not a document.
const MAX_QUERY_CHARS: usize = 1000;
/// A parent chunk, around 512 tokens. The model truncates past its own window anyway; this is
/// about bounding what crosses IPC and what gets tokenized, not about fidelity.
const MAX_PASSAGE_CHARS: usize = 4000;

/// The directory this model's files live in, both under the base URL and on disk.
const REMOTE_DIR: &str = "bge-reranker-v2-m3";
/// The `onnx/` level is transformers.js's requirement, not ours — see embeddings.rs.
const ONNX_FILE: &str = "onnx/model_int8.onnx";

/// Recorded for the same reason the embedder records its own: a stored score is only
/// comparable with another score from the same model. Read from TypeScript's copy of it, not
/// from here, for the same reason `EMBEDDING_MODEL_ID` is.
#[allow(dead_code)]
pub const RERANKER_MODEL_ID: &str = "bge-reranker-v2-m3-int8";

/// Measured from the artefacts in `/data/leo/bench-retrieval/gte-int8/out/`.
const MODEL_FILES: [ModelFile; 5] = [
    ModelFile {
        name: ONNX_FILE,
        bytes: 570_698_919,
        sha256: "74db7a0ec9bacc6bb199467a46128c46d57a604f4c18dcba272d699530a83be5",
    },
    ModelFile {
        name: "tokenizer.json",
        bytes: 17_098_273,
        sha256: "69564b696052886ed0ac63fa393e928384e0f8caada38c1f4864a9bfbf379c15",
    },
    ModelFile {
        name: "config.json",
        bytes: 795,
        sha256: "13dcd6c31d9fec9d1d8e158702072f62d7fa7d312a64b9fe057bec9a08cfe41a",
    },
    ModelFile {
        name: "special_tokens_map.json",
        bytes: 964,
        sha256: "8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835",
    },
    ModelFile {
        name: "tokenizer_config.json",
        bytes: 1_173,
        sha256: "7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4",
    },
];

/// Puts fastembed's results back into the order the passages arrived in.
///
/// `rerank` hands back a list sorted best-first, each entry carrying the index it came from.
/// Reading those indices back is also the check that the model scored the whole pool: a short
/// or duplicated result would otherwise silently leave some passage holding another's score.
fn scores_in_input_order(results: &[RerankResult], count: usize) -> Result<Vec<f32>, String> {
    let mut scores: Vec<Option<f32>> = vec![None; count];
    for result in results {
        let slot = scores
            .get_mut(result.index)
            .ok_or_else(|| "the reranker scored a passage that was not sent".to_string())?;
        *slot = Some(result.score);
    }
    scores
        .into_iter()
        .collect::<Option<Vec<f32>>>()
        .ok_or_else(|| "the reranker did not score every passage".to_string())
}

fn load_model(dir: &Path) -> Result<TextRerank, String> {
    let onnx = std::fs::read(dir.join(ONNX_FILE)).map_err(|error| error.to_string())?;
    let model = UserDefinedRerankingModel::new(onnx, model_files::tokenizer_files(dir)?);
    TextRerank::try_new_from_user_defined(model, RerankInitOptionsUserDefined::new())
        .map_err(|error| error.to_string())
}

fn rerank_blocking(
    dir: PathBuf,
    query: String,
    passages: Vec<String>,
) -> Result<Vec<f32>, String> {
    // Recovered rather than propagated, as in embeddings.rs: a panic under the guard would
    // otherwise poison this mutex and turn one bad pool into "reranking is dead until the app
    // restarts" — which, since the caller degrades silently, nobody would ever be told about.
    let mut guard = MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        *guard = Some(load_model(&dir)?);
    }
    let model = guard.as_mut().expect("model initialized above");
    let documents: Vec<&str> = passages.iter().map(String::as_str).collect();
    // One batch for the whole pool, and here that genuinely matters: this graph quantizes
    // activations dynamically, deriving their scales from whatever is in the batch, so scores
    // computed in two batches are not on one scale — and a ranking is nothing but a
    // comparison between them. Fifty short passages fit in one batch comfortably.
    let results = model
        .rerank(query.as_str(), &documents, false, Some(documents.len()))
        .map_err(|error| error.to_string())?;
    scores_in_input_order(&results, passages.len())
}

/// Scores each passage against the query with a cross-encoder, returning one score per
/// passage **in the order they were given**. The first call downloads the model; as with the
/// embedder, `allow_download` carries the app's network switch and nothing is fetched behind
/// a user who turned it off.
#[tauri::command]
pub async fn rerank_pairs(
    app: tauri::AppHandle,
    query: String,
    passages: Vec<String>,
    allow_download: bool,
) -> Result<Vec<f32>, String> {
    // Before anything else, including the download: an empty pool has an empty answer, and
    // pulling half a gigabyte to say so would be absurd.
    if passages.is_empty() {
        return Ok(Vec::new());
    }
    if passages.len() > MAX_PASSAGES_PER_CALL {
        return Err("too many passages in one rerank call".into());
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err("query too long to rerank".into());
    }
    if passages.iter().any(|p| p.chars().count() > MAX_PASSAGE_CHARS) {
        return Err("passage too long to rerank".into());
    }
    let dir = model_files::model_dir(&app, REMOTE_DIR)?;
    model_files::ensure(&dir, REMOTE_DIR, &MODEL_FILES, allow_download).await?;
    tauri::async_runtime::spawn_blocking(move || rerank_blocking(dir, query, passages))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "reranker_tests.rs"]
mod tests;
