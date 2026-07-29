// Purpose: local text embeddings via fastembed (multilingual-e5-small, ONNX).
// The model downloads once into the app data dir, then works fully offline.
// Main export: the `embed_texts` Tauri command.

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use std::sync::Mutex;
use tauri::Manager;

static MODEL: Mutex<Option<TextEmbedding>> = Mutex::new(None);

fn embed_blocking(cache_dir: std::path::PathBuf, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = MODEL.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let options = TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
            .with_cache_dir(cache_dir);
        *guard = Some(TextEmbedding::try_new(options).map_err(|e| e.to_string())?);
    }
    let model = guard.as_mut().expect("model initialized above");
    // E5 models expect a task prefix; "query: " is the standard choice for similarity use.
    let prefixed: Vec<String> = texts.into_iter().map(|t| format!("query: {t}")).collect();
    model.embed(prefixed, None).map_err(|e| e.to_string())
}

/// Embeds a batch of texts locally. First call downloads the model (needs network once).
#[tauri::command]
pub async fn embed_texts(
    app: tauri::AppHandle,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("embedding-models");
    tauri::async_runtime::spawn_blocking(move || embed_blocking(cache_dir, texts))
        .await
        .map_err(|e| e.to_string())?
}
