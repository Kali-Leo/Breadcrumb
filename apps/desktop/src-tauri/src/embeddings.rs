// Purpose: local text embeddings via fastembed (multilingual-e5-small, ONNX).
// The model downloads once into the app data dir, then works fully offline.
// Main export: the `embed_texts` Tauri command.

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use std::sync::Mutex;
use tauri::Manager;

static MODEL: Mutex<Option<TextEmbedding>> = Mutex::new(None);

/// One call embeds the nodes touched by a round, or a batch during a sweep. Well above what
/// either needs, and low enough that a runaway caller cannot ask for an unbounded allocation.
const MAX_TEXTS_PER_CALL: usize = 512;
/// A node label plus its summary. Anything longer is truncated by the model anyway.
const MAX_TEXT_CHARS: usize = 2000;

/// Whether the model has already been fetched into the cache. `TextEmbedding::try_new`
/// downloads when it has not, which is a network request the user may have switched off.
fn model_is_cached(cache_dir: &std::path::Path) -> bool {
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return false;
    };
    entries.flatten().any(|entry| entry.path().is_dir())
}

fn embed_blocking(
    cache_dir: std::path::PathBuf,
    texts: Vec<String>,
    allow_download: bool,
) -> Result<Vec<Vec<f32>>, String> {
    // Recovered rather than propagated: a panic inside embed() while the guard was held used
    // to poison this mutex, which turned one bad batch into "embeddings are dead until the
    // app restarts".
    let mut guard = MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.is_none() {
        if !allow_download && !model_is_cached(&cache_dir) {
            return Err("embedding model not downloaded and the network switch is off".into());
        }
        let options = TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
            .with_cache_dir(cache_dir);
        *guard = Some(TextEmbedding::try_new(options).map_err(|e| e.to_string())?);
    }
    let model = guard.as_mut().expect("model initialized above");
    // E5 models expect a task prefix; "query: " is the standard choice for similarity use.
    let prefixed: Vec<String> = texts.into_iter().map(|t| format!("query: {t}")).collect();
    model.embed(prefixed, None).map_err(|e| e.to_string())
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
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("embedding-models");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || embed_blocking(cache_dir, texts, allow_download))
        .await
        .map_err(|e| e.to_string())?
}
