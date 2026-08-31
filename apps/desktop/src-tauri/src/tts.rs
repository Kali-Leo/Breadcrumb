// Purpose: local TTS bridge for the diglot weave (spec 033 T9) — runs a user-configured
// Piper binary and returns the synthesized WAV bytes to the frontend for playback.
//
// SECURITY: this command takes a program path from the webview, so it is the one place in
// the app where renderer code could otherwise ask Rust to execute an arbitrary binary. The
// path is therefore validated against what Piper actually is before anything is spawned:
// a real file, named `piper`, that the user pointed at. Without that check a single injected
// script — or one compromised npm dependency — would be local code execution as the user.
// Main exports: piper_synthesize (Tauri command).

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Filenames the Piper binary is actually distributed under. Anything else is refused, so
/// naming `/bin/sh` or an interpreter here does not work.
const ALLOWED_BINARY_NAMES: [&str; 2] = ["piper", "piper.exe"];

/// Voice models are ONNX files. Refusing anything else keeps the second argument from being
/// used to smuggle a script path into whatever the first argument turned out to be.
const REQUIRED_MODEL_EXTENSION: &str = "onnx";

/// A synthesis request is one word or phrase from a chat message, not a document. Capping it
/// bounds both the child's work and the WAV that comes back over IPC.
const MAX_TEXT_BYTES: usize = 4096;

/// Resolves a caller-supplied path and refuses anything that is not the program we mean to
/// run. Symlinks are followed first (`canonicalize`), so pointing a file called `piper` at
/// `/bin/sh` does not get past the name check either.
fn validated_binary(piper_path: &str) -> Result<PathBuf, String> {
    let resolved = Path::new(piper_path)
        .canonicalize()
        .map_err(|_| "piper binary not found".to_string())?;
    if !resolved.is_file() {
        return Err("configured piper path is not a file".to_string());
    }
    let name = resolved
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if !ALLOWED_BINARY_NAMES.contains(&name) {
        return Err("configured piper path is not a piper binary".to_string());
    }
    Ok(resolved)
}

fn validated_model(model_path: &str) -> Result<PathBuf, String> {
    let resolved = Path::new(model_path)
        .canonicalize()
        .map_err(|_| "voice model not found".to_string())?;
    if !resolved.is_file() {
        return Err("configured voice model is not a file".to_string());
    }
    let extension = resolved
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case(REQUIRED_MODEL_EXTENSION) {
        return Err("configured voice model is not an .onnx file".to_string());
    }
    Ok(resolved)
}

/// Synthesizes `text` with a local Piper installation. The binary and voice model are
/// user-configured paths (nothing is bundled); the frontend falls back to system TTS or
/// IPA display when this fails. WAV bytes go back over IPC and are played as a Blob.
#[tauri::command]
pub async fn piper_synthesize(
    app: tauri::AppHandle,
    piper_path: String,
    model_path: String,
    text: String,
) -> Result<Vec<u8>, String> {
    use tauri::Manager;

    if text.len() > MAX_TEXT_BYTES {
        return Err("text too long to synthesize".to_string());
    }
    let binary = validated_binary(&piper_path)?;
    let model = validated_model(&model_path)?;

    // Under the app's own cache directory rather than the shared temp dir: a predictable
    // /tmp name is a symlink-swap target on a machine with more than one user, and this
    // machine has more than one user.
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("tts");
    std::fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    let output_file = cache_dir.join(format!(
        "piper-{}-{}.wav",
        std::process::id(),
        // Distinct per call, so two syntheses in flight cannot clobber each other's output.
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0)
    ));

    let result = synthesize_blocking(&binary, &model, &output_file, &text);
    // Removed on every path, not just success — a failed run used to leave the file behind.
    let _ = std::fs::remove_file(&output_file);
    result
}

fn synthesize_blocking(
    binary: &Path,
    model: &Path,
    output_file: &Path,
    text: &str,
) -> Result<Vec<u8>, String> {
    let mut child = Command::new(binary)
        .arg("--model")
        .arg(model)
        .arg("--output_file")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("failed to start piper: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "piper stdin unavailable".to_string())?
        .write_all(text.as_bytes())
        .map_err(|error| format!("failed to write to piper: {error}"))?;
    let status = child
        .wait()
        .map_err(|error| format!("piper did not finish: {error}"))?;
    if !status.success() {
        return Err(format!("piper exited with {status}"));
    }
    std::fs::read(output_file).map_err(|error| format!("failed to read wav: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_binary_that_is_not_piper() {
        // The exact shape of the attack: name any interpreter and pipe it a script.
        assert!(validated_binary("/bin/sh").is_err());
        assert!(validated_binary("/usr/bin/python3").is_err());
    }

    #[test]
    fn refuses_a_path_that_does_not_exist() {
        assert!(validated_binary("/nonexistent/piper").is_err());
        assert!(validated_model("/nonexistent/voice.onnx").is_err());
    }

    #[test]
    fn refuses_a_model_that_is_not_onnx() {
        assert!(validated_model("/etc/passwd").is_err());
    }
}
