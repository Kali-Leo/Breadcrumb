// Purpose: the tests for tts.rs — the run, not the path checks (those are in tts_paths.rs).
// They need a real child process, which is why they live beside the module rather than in it:
// this crate holds every source file to the same 200-line ceiling.

use super::{synthesize_blocking, POLL_INTERVAL};
use std::time::{Duration, Instant};

struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir =
            std::env::temp_dir().join(format!("breadcrumb-tts-run-{}-{name}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).expect("temp dir");
        Self(dir)
    }

    /// A stand-in for piper: a script that behaves however the test needs it to. The path
    /// checks are not involved here — synthesize_blocking is handed a path that has already
    /// been through them.
    #[cfg(unix)]
    fn script(&self, body: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = self.0.join("piper");
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        path
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

/// `synthesize_blocking`, retried past one race that belongs to the test rig rather than to
/// the code under test: these tests run in parallel and each writes its own stand-in script,
/// and between another thread's fork and its exec that thread's child briefly holds a
/// writable descriptor to a file this thread is about to run. Linux answers that with ETXTBSY.
fn synthesize(
    binary: &std::path::Path,
    model: &std::path::Path,
    output: &std::path::Path,
    text: &str,
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    for _ in 0..100 {
        let result = synthesize_blocking(binary, model, output, text, timeout);
        match &result {
            Err(error) if error.contains("Text file busy") => std::thread::sleep(POLL_INTERVAL),
            _ => return result,
        }
    }
    synthesize_blocking(binary, model, output, text, timeout)
}

#[cfg(target_os = "linux")]
fn process_exists(pid: u32) -> bool {
    std::path::Path::new(&format!("/proc/{pid}")).exists()
}

/// The measured failure: a piper that hangs used to hang the call with it, forever, because
/// `child.wait()` has no deadline. The promise on the page never settled and the thread was
/// never given back.
#[cfg(unix)]
#[test]
fn a_piper_that_hangs_fails_the_call_instead_of_never_returning() {
    let scratch = Scratch::new("hang");
    let binary = scratch.script("sleep 30");
    let started = Instant::now();
    let result = synthesize(
        &binary,
        &scratch.0.join("voice.onnx"),
        &scratch.0.join("out.wav"),
        "hello",
        Duration::from_millis(200),
    );
    let elapsed = started.elapsed();
    let error = result.expect_err("a child that never exits must fail the call");
    assert!(error.contains("in time"), "unexpected error: {error}");
    assert!(elapsed < Duration::from_secs(5), "returned only after {elapsed:?}");
}

/// And the child does not outlive the call that gave up on it, nor stay in the process table
/// as a zombie afterwards.
#[cfg(target_os = "linux")]
#[test]
fn the_child_it_gave_up_on_is_gone() {
    let scratch = Scratch::new("kill");
    // The script records its own pid so the test can look for it after the call returns.
    let pid_file = scratch.0.join("pid");
    let binary = scratch.script(&format!("echo $$ > {}\nsleep 30", pid_file.display()));
    let _ = synthesize(
        &binary,
        &scratch.0.join("voice.onnx"),
        &scratch.0.join("out.wav"),
        "hello",
        Duration::from_millis(300),
    );
    let pid: u32 = std::fs::read_to_string(&pid_file)
        .expect("the script should have written its pid")
        .trim()
        .parse()
        .expect("a pid");
    // The kill is delivered asynchronously; give the kernel the same moment the poll uses.
    for _ in 0..100 {
        if !process_exists(pid) {
            break;
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    assert!(!process_exists(pid), "the abandoned piper is still running");
}

/// The ordinary path still works: a piper that writes its WAV and exits returns the bytes,
/// and well inside the deadline.
#[cfg(unix)]
#[test]
fn a_piper_that_finishes_returns_the_wav_it_wrote() {
    let scratch = Scratch::new("ok");
    let output = scratch.0.join("out.wav");
    let binary = scratch.script(&format!("cat > /dev/null\nprintf 'RIFFWAVE' > {}", output.display()));
    let bytes = synthesize(
        &binary,
        &scratch.0.join("voice.onnx"),
        &output,
        "hello",
        Duration::from_secs(10),
    )
    .expect("a well behaved piper should succeed");
    assert_eq!(bytes, b"RIFFWAVE");
}

/// A piper that fails is reported as a failure rather than as empty audio.
#[cfg(unix)]
#[test]
fn a_piper_that_exits_badly_is_an_error() {
    let scratch = Scratch::new("fail");
    let binary = scratch.script("exit 4");
    let error = synthesize(
        &binary,
        &scratch.0.join("voice.onnx"),
        &scratch.0.join("out.wav"),
        "hello",
        Duration::from_secs(10),
    )
    .expect_err("a non-zero exit must fail the call");
    assert!(error.contains("exited with"), "unexpected error: {error}");
}
