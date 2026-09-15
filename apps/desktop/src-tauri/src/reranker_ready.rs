// Purpose: getting the reranker onto this machine and into memory before a question needs
// it — the two commands the app's readiness check calls, kept apart from the scoring so
// that neither file has to read the other to be understood.
//
// The shape matters more than the size. `rerank_pairs` is asked with downloading forbidden
// on every turn; before these two existed that meant a fresh install answered "not
// downloaded" forever and no reader ever got the second stage. Now the app asks
// `reranker_available` (instant, no network), and if the answer is no, runs
// `prepare_reranker` in the background with the network switch as its permission — the
// turn that asked goes on in fused order, and the turns after the download are reranked.
// Main exports: the `reranker_available` and `prepare_reranker` Tauri commands.

use crate::model_files;
use crate::reranker::{load_model, LOCAL_DIR, MODEL, MODEL_FILES, SPEC};

/// Whether every file of the model is on disk and whole. Touches no network and loads
/// nothing: this is the question the app asks before deciding whether a turn can wait.
#[tauri::command]
pub fn reranker_available(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = model_files::model_dir(&app, LOCAL_DIR)?;
    Ok(model_files::is_cached(&dir, &MODEL_FILES))
}

/// Gets the model ready to score: fetches whatever files are missing — only with
/// `allow_download`, which carries the app's network switch — and reads them into memory,
/// so that `rerank_pairs` never has a download or a load in front of it. Loading under the
/// same guard `rerank_pairs` scores under means a question arriving mid-load waits for the
/// load rather than starting a second one.
#[tauri::command]
pub async fn prepare_reranker(app: tauri::AppHandle, allow_download: bool) -> Result<(), String> {
    let dir = model_files::model_dir(&app, LOCAL_DIR)?;
    model_files::ensure(&dir, &SPEC, allow_download).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.is_none() {
            *guard = Some(load_model(&dir)?);
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}
