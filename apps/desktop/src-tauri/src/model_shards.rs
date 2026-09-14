// Purpose: reading the manifest the mirror publishes beside a graph it could not serve whole.
//
// jsDelivr will not serve a file over 20 MB and a git repository will not hold one over 100,
// so the repository tree carries each ONNX graph as 18 MiB pieces and a `manifest.json` that
// names them in order, with the byte count and SHA-256 of the file they add up to. This
// module turns that manifest into the list of `(url, bytes)` model_download.rs writes into
// one `.part`; the whole-file check afterwards is against the table in embeddings.rs and
// reranker.rs, not against the manifest, because the manifest is fetched from the same host
// as the pieces and cannot vouch for it.
//
// What the manifest is trusted for is narrower: which pieces, in what order, how long each.
// A manifest that disagrees with the table about the whole file is refused before a piece
// is requested — that is a published set of bytes this build does not know, and 311 MB is
// too much to download in order to find that out at the end.

use crate::model_files::ModelFile;

pub const MANIFEST_FILE: &str = "manifest.json";

#[derive(serde::Deserialize)]
pub struct Manifest {
    /// The path the browser edition asks for (`onnx/model_int8.onnx`); the desktop table
    /// names the same file without the folder, so matching is by the last segment.
    pub file: String,
    pub bytes: u64,
    pub sha256: String,
    pub shards: Vec<Shard>,
}

#[derive(serde::Deserialize)]
pub struct Shard {
    pub name: String,
    pub bytes: u64,
}

impl Manifest {
    /// Whether this manifest describes `file` — the same name, length and digest. A different
    /// answer to any of the three means a different file.
    pub fn describes(&self, file: &ModelFile) -> bool {
        let base = self.file.rsplit('/').next().unwrap_or(&self.file);
        base == file.name
            && self.bytes == file.bytes
            && self.sha256.eq_ignore_ascii_case(file.sha256)
    }

    /// The pieces, in order, as URLs under `base` (a directory with its trailing slash).
    pub fn pieces(&self, base: &str) -> Vec<(String, u64)> {
        self.shards
            .iter()
            .map(|shard| (format!("{base}{}", shard.name), shard.bytes))
            .collect()
    }
}

/// Fetches and parses `{base}manifest.json`. A mirror without one is a mirror without the
/// graph, which the caller reports as that source failing rather than as a missing file.
pub async fn fetch_manifest(client: &reqwest::Client, base: &str) -> Result<Manifest, String> {
    let url = format!("{base}{MANIFEST_FILE}");
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("{MANIFEST_FILE}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "{MANIFEST_FILE}: server answered {}",
            response.status()
        ));
    }
    let text = response
        .text()
        .await
        .map_err(|error| format!("{MANIFEST_FILE}: {error}"))?;
    let manifest: Manifest =
        serde_json::from_str(&text).map_err(|error| format!("{MANIFEST_FILE}: {error}"))?;
    if manifest.shards.is_empty() {
        return Err(format!("{MANIFEST_FILE} lists no pieces"));
    }
    Ok(manifest)
}

#[cfg(test)]
#[path = "model_shards_tests.rs"]
mod tests;
