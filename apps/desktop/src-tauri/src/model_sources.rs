// Purpose: where a model's files come from, in the order worth trying, and the fallback from
// one to the next. Two sources, deliberately different in shape:
//
//  1. GitHub release assets — one whole file per name. The fastest download where GitHub is
//     reachable, and the only host that will take a 570 MB file at all.
//  2. The repository tree through jsDelivr — the same bytes, with each graph cut into 18 MiB
//     pieces (model_shards.rs). jsDelivr is reachable from the mainland, where GitHub's
//     release host usually is not, so this is the source most of the people this exists for
//     will actually use.
//
// Which one a user gets is measured, not configured: each is asked for the model's smallest
// file with a short timeout, in order, and the first that answers is used for the whole
// model. A source that answers the probe and then fails a download is passed over for the
// next, and the error a caller finally sees names what every source said. The app's
// mainland-network setting lives on the TypeScript side and is not read here; the probe
// reaches the same conclusion from the network itself, one timeout later.

use crate::model_download::{download, download_pieces};
use crate::model_files::{is_complete_file, model_base_url, ModelSpec};
use crate::model_shards::fetch_manifest;
use std::path::Path;
use std::time::Duration;

/// jsDelivr's GitHub endpoint; the repository, tag and folder follow. Mirrored in
/// packages/core-vectors/src/embeddingModel.ts (MODEL_MIRROR_BASE, modelMirrorDirectory), which
/// is where the browser edition builds the same URL.
pub const MIRROR_BASE: &str = "https://cdn.jsdelivr.net/gh/Kali-Leo/breadcrumb-language-packs@";

/// Long enough for a slow link to answer a HEAD, short enough that a blocked host costs one
/// wait rather than a session. Connecting is bounded separately for every request after it.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

pub enum Source {
    /// `base` is the release's own directory, e.g. `.../releases/download/<tag>/`.
    Release { base: String },
    /// `base` is the model's folder in the tree, e.g. `.../@<tag>/models/<dir>/`.
    Mirror { base: String },
}

impl Source {
    pub fn name(&self) -> &'static str {
        match self {
            Source::Release { .. } => "the release",
            Source::Mirror { .. } => "the mirror",
        }
    }

    fn base(&self) -> &str {
        match self {
            Source::Release { base } | Source::Mirror { base } => base,
        }
    }

    /// Where a file of that name would be, whole.
    pub fn file_url(&self, name: &str) -> String {
        format!("{}{name}", self.base())
    }
}

/// In order of preference. The environment override moves the release, not the mirror: a
/// build pointed at a staging host should still fall through to the published pieces.
pub fn sources_for(spec: &ModelSpec) -> Vec<Source> {
    vec![
        Source::Release {
            base: format!("{}{}/", model_base_url(), spec.release),
        },
        Source::Mirror {
            base: format!("{MIRROR_BASE}{}/models/{}/", spec.release, spec.dir),
        },
    ]
}

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())
}

/// True when the source answers for the smallest file of the model inside the timeout.
/// Anything else — refused, timed out, a 4xx — is "not this one".
async fn reachable(client: &reqwest::Client, source: &Source, spec: &ModelSpec) -> bool {
    let Some(smallest) = spec.files.iter().min_by_key(|file| file.bytes) else {
        return false;
    };
    client
        .head(source.file_url(smallest.name))
        .timeout(PROBE_TIMEOUT)
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}

/// Every file still missing from `dir`, from this one source.
async fn fetch_from(
    client: &reqwest::Client,
    dir: &Path,
    spec: &ModelSpec,
    source: &Source,
) -> Result<(), String> {
    let missing = spec
        .files
        .iter()
        .filter(|file| !is_complete_file(&dir.join(file.name)));
    // Read once per model, and only from the mirror: the release has no manifest and needs
    // none. Its absence on the mirror is an answer about the mirror, reported as such.
    let manifest = match source {
        Source::Mirror { base } => Some(fetch_manifest(client, base).await?),
        Source::Release { .. } => None,
    };
    for file in missing {
        let dest = dir.join(file.name);
        match manifest
            .as_ref()
            .filter(|manifest| manifest.describes(file))
        {
            Some(manifest) => {
                download_pieces(client, &manifest.pieces(source.base()), &dest, file).await?
            }
            None => download(client, &source.file_url(file.name), &dest, file).await?,
        }
    }
    Ok(())
}

/// Tries the sources in order and returns on the first that delivers every missing file.
/// Nothing here consults the network switch — model_files::ensure has already answered it.
pub async fn fetch_missing(dir: &Path, spec: &ModelSpec, sources: &[Source]) -> Result<(), String> {
    let client = client()?;
    let mut refusals = Vec::new();
    for source in sources {
        if !reachable(&client, source, spec).await {
            refusals.push(format!("{} did not answer", source.name()));
            continue;
        }
        match fetch_from(&client, dir, spec, source).await {
            Ok(()) => return Ok(()),
            Err(problem) => refusals.push(format!("{}: {problem}", source.name())),
        }
    }
    Err(format!(
        "{} could not be downloaded — {}",
        spec.release,
        refusals.join("; ")
    ))
}

#[cfg(test)]
#[path = "model_sources_tests.rs"]
mod tests;
