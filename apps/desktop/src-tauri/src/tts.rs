// Purpose: local TTS bridge for the diglot weave — runs a user-configured
// Piper binary and returns the synthesized WAV bytes to the frontend for playback.
//
// The paths are checked first, by tts_paths.rs, which is where the reasoning about executing
// a renderer-supplied program lives. What is left here is the run itself, and the two ways a
// child process can hurt the app that spawned it: by never finishing, and by finishing on a
// thread the rest of the app needed.
// Main exports: piper_synthesize (Tauri command).

use crate::tts_paths::{validated_binary, validated_model};
use std::io::Write;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

/// A synthesis request is one word or phrase from a chat message, not a document. Capping it
/// bounds both the child's work and the WAV that comes back over IPC.
const MAX_TEXT_BYTES: usize = 4096;

/// How long a word may take. Piper answers a phrase in well under a second on any machine that
/// can run this app; a run still going after this is not slow, it is stuck — waiting on a
/// terminal that is not there, or on a model file that is being written to. Without a limit
/// `wait()` never returns, and the promise on the page never settles either.
const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(30);

/// Short enough that a normal synthesis is not noticeably delayed by the polling, long enough
/// that waiting costs nothing measurable.
const POLL_INTERVAL: Duration = Duration::from_millis(20);

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

    // On the blocking pool, not on a tokio worker. Spawning a process, writing to its stdin
    // and waiting for it are all blocking calls, and this command used to make them from
    // inside an async fn — one synthesis held a runtime worker for its whole duration, and a
    // piper that hung held it until the app closed.
    tauri::async_runtime::spawn_blocking(move || {
        let result = synthesize_blocking(&binary, &model, &output_file, &text, SYNTHESIS_TIMEOUT);
        // Removed on every path, not just success — a failed run used to leave the file behind.
        let _ = std::fs::remove_file(&output_file);
        result
    })
    .await
    .map_err(|error| format!("piper did not finish: {error}"))?
}

fn synthesize_blocking(
    binary: &Path,
    model: &Path,
    output_file: &Path,
    text: &str,
    timeout: Duration,
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
    let written = child
        .stdin
        .take()
        .ok_or_else(|| "piper stdin unavailable".to_string())
        .and_then(|mut stdin| {
            stdin
                .write_all(text.as_bytes())
                .map_err(|error| format!("failed to write to piper: {error}"))
        });
    if let Err(error) = written {
        stop(&mut child);
        return Err(error);
    }
    let status = wait_with_timeout(&mut child, timeout)?;
    if !status.success() {
        return Err(format!("piper exited with {status}"));
    }
    std::fs::read(output_file).map_err(|error| format!("failed to read wav: {error}"))
}

/// `Child::wait` with a deadline. Polling rather than a signal handler: this app already runs
/// the call on the blocking pool, and a handler would be a process-wide change made for one
/// feature. A child still running at the deadline is killed and reaped, so a stuck piper costs
/// one failed word rather than a leaked process.
fn wait_with_timeout(child: &mut Child, timeout: Duration) -> Result<ExitStatus, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {}
            Err(error) => return Err(format!("piper did not finish: {error}")),
        }
        if Instant::now() >= deadline {
            stop(child);
            return Err("piper did not finish in time".to_string());
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Kills and then waits: without the wait the killed child stays in the process table as a
/// zombie for the rest of the app's life.
fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
#[path = "tts_tests.rs"]
mod tests;
