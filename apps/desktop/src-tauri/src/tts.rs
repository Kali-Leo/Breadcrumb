// Purpose: local TTS bridge for the diglot weave (spec 033 T9) — runs a user-configured
// Piper binary and returns the synthesized WAV bytes to the frontend for playback.
// Main exports: piper_synthesize (Tauri command).

use std::io::Write;
use std::process::{Command, Stdio};

/// Synthesizes `text` with a local Piper installation. The binary and voice model are
/// user-configured paths (nothing is bundled); the frontend falls back to system TTS or
/// IPA display when this fails. WAV bytes go back over IPC and are played as a Blob.
#[tauri::command]
pub fn piper_synthesize(piper_path: String, model_path: String, text: String) -> Result<Vec<u8>, String> {
    let output_file = std::env::temp_dir().join(format!("breadcrumb-piper-{}.wav", std::process::id()));
    let mut child = Command::new(&piper_path)
        .arg("--model")
        .arg(&model_path)
        .arg("--output_file")
        .arg(&output_file)
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
    let bytes = std::fs::read(&output_file).map_err(|error| format!("failed to read wav: {error}"))?;
    let _ = std::fs::remove_file(&output_file);
    Ok(bytes)
}
