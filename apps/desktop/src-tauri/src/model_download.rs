// Purpose: fetching one model file and deciding whether what came back is worth keeping.
// Split from model_files.rs, which answers the other question — whether a file is already
// here — and which holds the reasoning about why a half-finished download must never pass
// for a finished one.
//
// Nothing is accepted on the strength of having arrived. A body is kept only if it is exactly
// the length the caller's table records and hashes to exactly the digest beside it; anything
// else is deleted where it lies. The length is checked first, and against `Content-Length`
// before a byte is written where the server offers one, because a mismatch there is the same
// refusal three hundred megabytes earlier.

use crate::model_files::{part_path, ModelFile};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;

/// Streams one file to its `.part`, hashing as it goes, and renames only on a clean verdict.
/// Nothing is held whole in memory: the ONNX graphs here are hundreds of megabytes.
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    file: &ModelFile,
) -> Result<(), String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("{}: {error}", file.name))?;
    if !response.status().is_success() {
        return Err(format!("{}: server answered {}", file.name, response.status()));
    }
    // Some servers do not say, and a body may still arrive truncated after saying; this is
    // the cheap half of the check, not a replacement for weighing what actually landed.
    if let Some(promised) = response.content_length() {
        if promised != file.bytes {
            return Err(size_complaint(file, promised));
        }
    }
    let part = part_path(dest);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let handle = std::fs::File::create(&part).map_err(|error| error.to_string())?;
    let mut sink = std::io::BufWriter::new(handle);
    let mut hasher = Sha256::new();
    let mut written: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("{}: {error}", file.name))?
    {
        hasher.update(&chunk);
        written += chunk.len() as u64;
        sink.write_all(&chunk).map_err(|error| error.to_string())?;
    }
    sink.flush().map_err(|error| error.to_string())?;
    drop(sink);
    if let Err(problem) = verify(file, written, hex(&hasher.finalize())) {
        let _ = std::fs::remove_file(&part);
        return Err(problem);
    }
    std::fs::rename(&part, dest).map_err(|error| error.to_string())
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The verdict on a body that has fully arrived, separated out so it can be tested without a
/// server. A mismatch is a refusal, never a warning: the caller deletes the file.
fn verify(file: &ModelFile, written: u64, digest: String) -> Result<(), String> {
    if written != file.bytes {
        return Err(size_complaint(file, written));
    }
    if !digest.eq_ignore_ascii_case(file.sha256) {
        return Err(format!("{} does not match its recorded digest", file.name));
    }
    Ok(())
}

fn size_complaint(file: &ModelFile, found: u64) -> String {
    let (name, expected) = (file.name, file.bytes);
    format!("{name} should be {expected} bytes and this is {found}")
}

#[cfg(test)]
#[path = "model_download_tests.rs"]
mod tests;
