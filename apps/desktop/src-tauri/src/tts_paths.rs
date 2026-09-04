// Purpose: deciding whether the two paths the webview handed over are the Piper installation
// the user meant, before anything is executed or read.
//
// SECURITY: piper_synthesize takes a program path from the renderer, so this is the one place
// in the app where injected script — or one compromised npm dependency — could otherwise ask
// Rust to execute an arbitrary binary as the user. The path is validated against what Piper
// actually is: a real file, named `piper`, owned by this user, with exactly one name.
//
// Known limit, stated rather than implied: this establishes provenance, not file format. A
// shell script the user owns and called `piper` passes, because nothing here reads the file's
// magic bytes. What it does stop is the attack that motivated it — pointing the setting at an
// interpreter already on the machine, by name, by symlink, or by hard link.
// Main exports: validated_binary, validated_model.

use std::path::{Path, PathBuf};

/// Filenames the Piper binary is actually distributed under. Anything else is refused, so
/// naming `/bin/sh` or an interpreter here does not work.
const ALLOWED_BINARY_NAMES: [&str; 2] = ["piper", "piper.exe"];

/// Voice models are ONNX files. Refusing anything else keeps the second argument from being
/// used to smuggle a script path into whatever the first argument turned out to be.
const REQUIRED_MODEL_EXTENSION: &str = "onnx";

/// Resolves a caller-supplied path and refuses anything that is not the program we mean to
/// run. Symlinks are followed first (`canonicalize`), so pointing a file called `piper` at
/// `/bin/sh` does not get past the name check either.
pub fn validated_binary(piper_path: &str) -> Result<PathBuf, String> {
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
    #[cfg(unix)]
    check_unix_provenance(&resolved)?;
    Ok(resolved)
}

/// `canonicalize` resolves symlinks but cannot see a HARD link, a second name for the same
/// inode: `ln /usr/bin/python3 ~/piper` yields a real file named `piper` that IS the
/// interpreter. A Piper the user installed has their uid and exactly one name; demand both.
///
/// Windows has neither half of this check. NTFS supports hard links and this function is not
/// compiled there, so on Windows the guarantee above is only the filename — a gap the file
/// header used to describe as if it were universal, and one CI would not catch either, since
/// `cargo test` runs on ubuntu only.
#[cfg(unix)]
fn check_unix_provenance(resolved: &Path) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let metadata = resolved
        .metadata()
        .map_err(|_| "piper binary not readable".to_string())?;
    // SAFETY: getuid() reads a property of this process. It cannot fail and touches no memory.
    if metadata.uid() != unsafe { libc::getuid() } {
        return Err("configured piper path is not owned by this user".to_string());
    }
    if metadata.nlink() != 1 {
        return Err("configured piper path has more than one name".to_string());
    }
    Ok(())
}

pub fn validated_model(model_path: &str) -> Result<PathBuf, String> {
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

    /// A hard link is how the name check gets defeated: another file's inode, named `piper`.
    #[cfg(unix)]
    #[test]
    fn refuses_a_hardlink_but_accepts_a_file_with_one_name() {
        let dir = std::env::temp_dir().join(format!("breadcrumb-tts-{}", std::process::id()));
        let sub = dir.join("sub");
        std::fs::create_dir_all(&sub).expect("temp dirs");
        let (other, alone, linked) = (dir.join("other"), dir.join("piper"), sub.join("piper"));
        std::fs::write(&other, b"not really piper").expect("write");
        std::fs::write(&alone, b"not really piper").expect("write");
        std::fs::hard_link(&other, &linked).expect("hard link");

        let accepted = validated_binary(alone.to_str().expect("utf-8 path"));
        let refused = validated_binary(linked.to_str().expect("utf-8 path"));
        std::fs::remove_dir_all(&dir).ok();

        assert!(accepted.is_ok(), "a plain owned file named piper must pass");
        assert!(refused.is_err(), "a hardlinked binary must be refused");
    }
}
