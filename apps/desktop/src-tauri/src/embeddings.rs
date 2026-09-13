// Purpose: local text embeddings — Alibaba-NLP/gte-multilingual-base, int8 ONNX, cut down to
// 384 dimensions. The model downloads once into the app data dir, then works fully offline.
// Main export: the `embed_texts` Tauri command.
//
// fastembed has no built-in entry for gte, so this goes through its "bring your own model"
// path and the files are fetched by model_files.rs instead of by fastembed. That module holds
// the reasoning about the network switch and about half-finished downloads; what belongs here
// is what makes this model this model.
//
// Three things about that. It pools on CLS, not by averaging. It takes no task prefix — the
// `query: ` / `passage: ` strings this file used to prepend are an e5 convention and would
// now be tokens of noise at the front of every input, so they are gone. And it is
// Matryoshka-trained, which is why 384 of its values are stored instead of all 768.
//
// What int8 bought, so nobody re-measures it hoping otherwise: the download went from 1226 MB
// to 311 MB, and the vectors barely moved — cosine against torch fp32 over 200 real passages
// averages 0.99942 at full width and 0.99948 at the 384 stored. It did not buy speed. At
// batch 1 this file is *slower* than fp32 (70-76 ms against 53 ms per passage) because
// onnxruntime rehydrates 85M weights on every inference instead of folding the dequantize
// away; by batch 8 that cost is spread out and the gap nearly closes. Size, not latency.

use crate::model_files::{self, ModelFile};
use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, UserDefinedEmbeddingModel,
};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static MODEL: Mutex<Option<TextEmbedding>> = Mutex::new(None);

/// The string stamped into every vector row this app writes, so a later build can tell which
/// model produced a stored vector and re-embed when the answer is "not this one".
///
/// The browser edition writes the same string from
/// `packages/core-vectors/src/embeddingModel.ts`, which holds this literal a second time. The
/// two must never drift: a vector embedded by one edition is read by the other, and the only
/// thing saying they are comparable is that these two strings match.
///
/// Nothing in Rust reads it — the string is written into the database by the TypeScript that
/// calls this command. It lives here so the two copies sit somewhere a test can compare.
#[allow(dead_code)]
pub const EMBEDDING_MODEL_ID: &str = "gte-multilingual-base-int8-384";

/// How many of the model's values are kept. Not a property of the ONNX graph — a decision
/// about storage that both editions have to make identically.
pub const EMBEDDING_DIMENSIONS: usize = 384;

/// One call embeds the nodes touched by a round, or a batch during a sweep. Well above what
/// either needs, and low enough that a runaway caller cannot ask for an unbounded allocation.
const MAX_TEXTS_PER_CALL: usize = 512;
/// A node label plus its summary. Anything longer is truncated by the model anyway.
const MAX_TEXT_CHARS: usize = 2000;

/// The directory this model's files live in, both under the base URL and on disk.
const REMOTE_DIR: &str = "gte-multilingual-base";
/// The `onnx/` level is transformers.js's requirement, not ours: the browser edition loads
/// these same uploaded files and looks for the graph in that subfolder. Flattening it here
/// would tidy one path and break the other edition, so it stays.
const ONNX_FILE: &str = "onnx/model_int8.onnx";

/// Measured from the artefacts in `/data/leo/bench-retrieval/gte-int8/out/`.
const MODEL_FILES: [ModelFile; 5] = [
    ModelFile {
        name: ONNX_FILE,
        bytes: 310_821_344,
        sha256: "1601d9f73a0cc323d4ec6277f77111c528dc6bdaf4da5c4326e74dbaaa02cad6",
    },
    ModelFile {
        name: "tokenizer.json",
        bytes: 17_082_756,
        sha256: "f59925fcb90c92b894cb93e51bb9b4a6105c5c249fe54ce1c704420ac39b81af",
    },
    ModelFile {
        name: "config.json",
        bytes: 1_429,
        sha256: "711bdc81365fc25d30533cf05b9fdf588e5ba01f18540fbbb1307d787597a313",
    },
    ModelFile {
        name: "special_tokens_map.json",
        bytes: 964,
        sha256: "8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835",
    },
    ModelFile {
        name: "tokenizer_config.json",
        bytes: 1_149,
        sha256: "24cebbf2ef20fc317256e03e52ac7b2ca326586f946a8427ecac036332bf0933",
    },
];

/// Keeps the first [`EMBEDDING_DIMENSIONS`] values of a vector and makes it unit length again.
///
/// The renormalizing is the part that matters. gte is Matryoshka-trained, so its leading 384
/// values are a usable embedding on their own — but they are the leading part of a vector
/// normalized over all 768, so on their own they are shorter than unit length, by an amount
/// that differs per text. Cosine similarity is computed here as a plain dot product, which is
/// only cosine similarity when both sides are unit vectors; skipping this step would leave
/// every score scaled by an arbitrary per-text factor and the ranking quietly wrong.
pub fn truncate_and_renormalize(vector: &[f32]) -> Vec<f32> {
    let head = &vector[..vector.len().min(EMBEDDING_DIMENSIONS)];
    let norm = head.iter().map(|value| value * value).sum::<f32>().sqrt();
    // A zero (or non-finite) vector has no direction to preserve; dividing would make it NaN
    // and poison every comparison it takes part in afterwards.
    if !norm.is_finite() || norm <= f32::EPSILON {
        return head.to_vec();
    }
    head.iter().map(|value| value / norm).collect()
}

fn load_model(dir: &Path) -> Result<TextEmbedding, String> {
    let onnx = std::fs::read(dir.join(ONNX_FILE)).map_err(|error| error.to_string())?;
    // `None`, despite the file being called int8, and this is the question to answer before
    // anyone "fixes" it. The export is weight-only: weights are stored int8 with a scale per
    // output channel, a DequantizeLinear restores fp32 before each MatMul, and activations
    // are fp32 the whole way through. Nothing is scaled per batch, so a vector does not
    // depend on what it was batched with — which is exactly what QuantizationMode::Dynamic
    // exists to work around, and declaring it would only force whole calls into one batch.
    //
    // It is weight-only because ordinary dynamic quantization destroys this model. The damage
    // is in the activations entering the MLP's `down_proj`, where the GLU product carries a
    // few enormous outlier channels; no dynamic configuration cleared the 0.99 cosine gate at
    // a tolerable size, while weight-only reaches 0.9994. The reranker below went the other
    // way for reasons just as specific to it — neither answer transfers.
    let model = UserDefinedEmbeddingModel::new(onnx, model_files::tokenizer_files(dir)?)
        .with_pooling(Pooling::Cls)
        .with_quantization(QuantizationMode::None);
    TextEmbedding::try_new_from_user_defined(model, InitOptionsUserDefined::new())
        .map_err(|error| error.to_string())
}

fn embed_blocking(dir: PathBuf, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    // Recovered rather than propagated: a panic inside embed() while the guard was held used
    // to poison this mutex, which turned one bad batch into "embeddings are dead until the
    // app restarts".
    let mut guard = MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        *guard = Some(load_model(&dir)?);
    }
    let model = guard.as_mut().expect("model initialized above");
    let vectors = model.embed(texts, None).map_err(|error| error.to_string())?;
    Ok(vectors
        .iter()
        .map(|vector| truncate_and_renormalize(vector))
        .collect())
}

/// Embeds a batch of texts locally. The first call downloads the model, which is the one
/// time this touches the network — `allow_download` carries the app's network switch so that
/// download cannot happen behind a user who turned it off. Once cached, embedding works
/// offline and the switch stops mattering.
#[tauri::command]
pub async fn embed_texts(
    app: tauri::AppHandle,
    texts: Vec<String>,
    allow_download: bool,
) -> Result<Vec<Vec<f32>>, String> {
    if texts.len() > MAX_TEXTS_PER_CALL {
        return Err("too many texts in one embedding call".into());
    }
    if texts.iter().any(|text| text.chars().count() > MAX_TEXT_CHARS) {
        return Err("text too long to embed".into());
    }
    let dir = model_files::model_dir(&app, REMOTE_DIR)?;
    model_files::ensure(&dir, REMOTE_DIR, &MODEL_FILES, allow_download).await?;
    // On the blocking pool: loading the graph and running it are both long synchronous calls,
    // and a tokio worker held for the duration of either is a frozen window.
    tauri::async_runtime::spawn_blocking(move || embed_blocking(dir, texts))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "embeddings_tests.rs"]
mod tests;
