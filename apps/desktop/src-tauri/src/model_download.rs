// Purpose: fetching one model file and deciding whether what came back is worth keeping.
// Split from model_files.rs, which answers the other question — whether a file is already
// here — and which holds the reasoning about why a half-finished download must never pass
// for a finished one. Which host to ask is model_sources.rs.
//
// Nothing is accepted on the strength of having arrived. A body is kept only if it is exactly
// the length the caller's table records and hashes to exactly the digest beside it; anything
// else is deleted where it lies. The length is checked first, and against `Content-Length`
// before a byte is written where the server offers one, because a mismatch there is the same
// refusal three hundred megabytes earlier.
//
// A file may arrive as one body or as several: the mirror serves the graph in 18 MiB pieces,
// and those are written into the same `.part`, one after another, and judged as one file at
// the end. The pieces are never on disk separately, so the rule "a `.part` is not a model"
// covers a download that stopped between pieces as well as one that stopped inside a body.

use crate::model_files::{part_path, ModelFile};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};

/// The `.part` a file is written into, hashing as it goes. Nothing is held whole in memory:
/// the ONNX graphs here are hundreds of megabytes.
struct PartSink {
    part: PathBuf,
    sink: std::io::BufWriter<std::fs::File>,
    hasher: Sha256,
    written: u64,
}

impl PartSink {
    fn create(dest: &Path) -> Result<Self, String> {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let part = part_path(dest);
        let handle = std::fs::File::create(&part).map_err(|error| error.to_string())?;
        Ok(Self {
            part,
            sink: std::io::BufWriter::new(handle),
            hasher: Sha256::new(),
            written: 0,
        })
    }

    /// Streams one body to the end of the part. Returns how many bytes this body held.
    async fn absorb(&mut self, mut response: reqwest::Response, name: &str) -> Result<u64, String> {
        let before = self.written;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("{name}: {error}"))?
        {
            self.hasher.update(&chunk);
            self.written += chunk.len() as u64;
            self.sink
                .write_all(&chunk)
                .map_err(|error| error.to_string())?;
        }
        Ok(self.written - before)
    }

    /// The verdict, then the rename — or the deletion. Consumes the sink so nothing can be
    /// written after the digest is taken.
    fn finish(mut self, dest: &Path, file: &ModelFile) -> Result<(), String> {
        self.sink.flush().map_err(|error| error.to_string())?;
        drop(self.sink);
        if let Err(problem) = verify(file, self.written, hex(&self.hasher.finalize())) {
            let _ = std::fs::remove_file(&self.part);
            return Err(problem);
        }
        std::fs::rename(&self.part, dest).map_err(|error| error.to_string())
    }
}

/// Sends the request and refuses before reading a body that already cannot be right. Some
/// servers do not say how long the body is, and a body may still arrive truncated after they
/// have said; this is the cheap half of the check, not a replacement for weighing what lands.
async fn open(
    client: &reqwest::Client,
    url: &str,
    name: &str,
    expected: u64,
) -> Result<reqwest::Response, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("{name}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("{name}: server answered {}", response.status()));
    }
    if let Some(promised) = response.content_length() {
        if promised != expected {
            return Err(size_complaint(name, expected, promised));
        }
    }
    Ok(response)
}

/// One file as one body.
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    file: &ModelFile,
) -> Result<(), String> {
    let response = open(client, url, file.name, file.bytes).await?;
    let mut sink = PartSink::create(dest)?;
    sink.absorb(response, file.name).await?;
    sink.finish(dest, file)
}

/// One file as several bodies, in the order given, each `(url, bytes)` checked for its own
/// length as it lands so a short piece is named rather than surfacing as a digest mismatch.
pub async fn download_pieces(
    client: &reqwest::Client,
    pieces: &[(String, u64)],
    dest: &Path,
    file: &ModelFile,
) -> Result<(), String> {
    let mut sink = PartSink::create(dest)?;
    for (url, bytes) in pieces {
        let response = open(client, url, file.name, *bytes).await?;
        let landed = sink.absorb(response, file.name).await?;
        if landed != *bytes {
            return Err(size_complaint(url, *bytes, landed));
        }
    }
    sink.finish(dest, file)
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The verdict on a body that has fully arrived, separated out so it can be tested without a
/// server. A mismatch is a refusal, never a warning: the caller deletes the file.
fn verify(file: &ModelFile, written: u64, digest: String) -> Result<(), String> {
    if written != file.bytes {
        return Err(size_complaint(file.name, file.bytes, written));
    }
    if !digest.eq_ignore_ascii_case(file.sha256) {
        return Err(format!("{} does not match its recorded digest", file.name));
    }
    Ok(())
}

fn size_complaint(name: &str, expected: u64, found: u64) -> String {
    format!("{name} should be {expected} bytes and this is {found}")
}

#[cfg(test)]
#[path = "model_download_tests.rs"]
mod tests;
