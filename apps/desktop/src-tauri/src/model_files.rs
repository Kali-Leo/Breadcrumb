// Purpose: getting a model's files onto disk once, and never getting them behind a user who
// switched the network off. The embedder and the reranker fetch from the same place and have
// the same reasons to be careful, so the care lives here rather than twice.
//
// fastembed only downloads its own built-in models and neither of ours is one, so the app
// fetches them itself. The bug that shapes this is worth restating, because a hand-written
// fetch could reintroduce it just as easily: a first attempt that was interrupted — lid
// closed, network dropped, app killed — leaves something on disk, and if that something
// counts as cached, the next call sails straight past a switched-off network switch. So
// "present" is a question about whole files, each written to a `.part` sibling and renamed
// into place only once its body has fully arrived and passed its check.
//
// This module answers where a file belongs and whether the copy on disk is whole; which host
// to ask is model_sources.rs, and fetching one file and deciding whether to keep what came
// back is model_download.rs.

use crate::model_sources::{fetch_missing, sources_for};
use std::path::{Path, PathBuf};

/// Overridable so a build can be pointed at a local file server or a fork's own assets
/// without a recompile; the default is where the released packs live. The override replaces
/// this one source, not the list — the mirror behind it stays.
///
/// GitHub release assets, not a repository tree: these graphs are 311 MB and 570 MB, and a
/// file in a git repository may be 100. A release download redirects to a host that sends no
/// CORS headers, which is why the browser edition reads split copies out of the repository
/// instead — reqwest has no such rule, so this edition takes the whole file in one request.
/// Mirrored in packages/core-vectors/src/embeddingModel.ts (DEFAULT_MODEL_FILE_BASE_URL).
pub const MODEL_BASE_URL_ENV: &str = "BREADCRUMB_MODEL_BASE_URL";
pub const DEFAULT_MODEL_BASE_URL: &str =
    "https://github.com/Kali-Leo/breadcrumb-language-packs/releases/download/";

/// The four files fastembed's tokenizer loader reads, whichever model it is loading.
const TOKENIZER_FILE_NAMES: [&str; 4] = [
    "tokenizer.json",
    "config.json",
    "special_tokens_map.json",
    "tokenizer_config.json",
];

/// One file of a model, with everything needed to decide whether to trust a copy of it.
///
/// `name` is both the asset's name in the release and the file's name on disk. Release assets
/// share one flat namespace per release, so there are no folders here — the release tag is the
/// only thing separating the embedder's `model_int8.onnx` from the reranker's.
pub struct ModelFile {
    pub name: &'static str,
    /// Exactly how many bytes this file has. Checked before the digest because it is the
    /// cheaper answer and the clearer message — a truncated body or a 404 page served with a
    /// 200 fails here, saying what it was, instead of as an opaque hash mismatch.
    pub bytes: u64,
    /// Lowercase hex SHA-256 of the whole file.
    pub sha256: &'static str,
}

/// Everything the download machinery needs to know about one model, so the embedder and the
/// reranker each hand over one value and neither repeats the other's plumbing.
pub struct ModelSpec {
    /// The directory the files live in on disk, and the folder the mirror publishes them under.
    pub dir: &'static str,
    /// The GitHub release the whole files hang off — also the git tag the mirror's pieces are
    /// pinned to, so one string names one set of bytes on both sources.
    pub release: &'static str,
    pub files: &'static [ModelFile],
}

/// The base every release URL is built from, with the trailing slash the callers assume.
pub fn model_base_url() -> String {
    let configured = std::env::var(MODEL_BASE_URL_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL_BASE_URL.to_string());
    if configured.ends_with('/') {
        configured
    } else {
        format!("{configured}/")
    }
}

/// Where this app keeps `name`'s files. One directory per model under the app data dir, so
/// removing a model is removing a directory and nothing else notices.
pub fn model_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    name: &str,
) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("models")
        .join(name))
}

/// Where a file is written while it is still arriving. Public because model_download.rs
/// writes it and this module is the one that refuses to trust a file it sits beside.
pub fn part_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    path.with_file_name(name)
}

/// Whether every file of the model is present and finished.
pub fn is_cached(dir: &Path, files: &[ModelFile]) -> bool {
    files
        .iter()
        .all(|file| is_complete_file(&dir.join(file.name)))
}

/// A finished file is one that exists, holds bytes, and has no `.part` sibling left over from
/// a download that stopped partway. The last clause is the conservative half: a stray `.part`
/// costs one repeated download, whereas trusting a truncated model costs silent nonsense in
/// every vector the app then stores.
pub fn is_complete_file(path: &Path) -> bool {
    if part_path(path).exists() {
        return false;
    }
    std::fs::metadata(path).is_ok_and(|meta| meta.is_file() && meta.len() > 0)
}

/// Makes sure every file is on disk, downloading only the ones that are not. Returns an error
/// without touching the network when something is missing and `allow_download` is false —
/// before a source is even named, which is what makes "zero requests" true.
pub async fn ensure(dir: &Path, spec: &ModelSpec, allow_download: bool) -> Result<(), String> {
    if is_cached(dir, spec.files) {
        return Ok(());
    }
    if !allow_download {
        return Err(format!(
            "{} is not downloaded and the network switch is off",
            spec.release
        ));
    }
    fetch_missing(dir, spec, &sources_for(spec)).await
}

/// Reads the tokenizer quartet a user-defined fastembed model is constructed from.
pub fn tokenizer_files(dir: &Path) -> Result<fastembed::TokenizerFiles, String> {
    let read = |name: &str| std::fs::read(dir.join(name)).map_err(|error| error.to_string());
    Ok(fastembed::TokenizerFiles {
        tokenizer_file: read(TOKENIZER_FILE_NAMES[0])?,
        config_file: read(TOKENIZER_FILE_NAMES[1])?,
        special_tokens_map_file: read(TOKENIZER_FILE_NAMES[2])?,
        tokenizer_config_file: read(TOKENIZER_FILE_NAMES[3])?,
    })
}

#[cfg(test)]
#[path = "model_files_tests.rs"]
mod tests;
