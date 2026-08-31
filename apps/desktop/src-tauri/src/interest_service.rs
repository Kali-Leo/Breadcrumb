// Purpose: bring up the local browsing-interest service (interest-model/daemon from the
// feed-mode project) without the user opening a terminal. The app looks for the project
// folder in the usual places, starts it, and says plainly what happened. Reading the
// connection token stays here too, for the setup step that needs it.

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

const SERVICE_ADDR: &str = "127.0.0.1:21456";
const DAEMON_RELATIVE_PATH: &str = "interest-model/daemon/app.py";

#[derive(serde::Serialize)]
pub struct ServiceStart {
    /// running | starting | notFound | pythonMissing | failed
    status: String,
    /// Absolute path of the daemon we started, empty when there was nothing to start.
    path: String,
    /// Free text for the "failed" case only — never shown raw to the user.
    detail: String,
}

impl ServiceStart {
    fn of(status: &str, path: String, detail: String) -> Self {
        Self { status: status.into(), path, detail }
    }
}

fn service_is_up() -> bool {
    let Ok(addr) = SERVICE_ADDR.parse::<SocketAddr>() else {
        return false;
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

/// Folders a checkout is plausibly sitting in.
const SEARCH_FOLDERS: [&str; 6] = ["桌面", "Desktop", "文档", "Documents", "projects", "code"];
/// Names the checkout itself is plausibly called.
const PROJECT_FOLDERS: [&str; 3] = ["bilibili", "feed-mode", "interest-model"];

/// The project is a separate checkout the user cloned themselves, so we look where people
/// actually put it rather than demanding a configured path.
///
/// SECURITY: this resolves to a script the app then executes, so the candidate set is a
/// fixed, enumerable list of exact paths. It deliberately does NOT enumerate directories:
/// an earlier version read_dir'd each root and accepted any child containing the relative
/// path, which meant anything that dropped a folder named `interest-model` into the home
/// directory — an extracted download, a synced folder, another account on a shared machine —
/// became code this app would run unprompted the moment the discovery page opened.
fn find_daemon(home: &PathBuf) -> Option<PathBuf> {
    let mut roots = vec![home.clone()];
    for folder in SEARCH_FOLDERS {
        roots.push(home.join(folder));
    }
    for root in roots {
        for project in PROJECT_FOLDERS {
            let candidate = root.join(project).join(DAEMON_RELATIVE_PATH);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Set while a spawned daemon is still coming up. The service takes tens of seconds to load
/// its model, and the liveness probe times out in 400ms, so without this latch a frontend
/// that keeps asking would spawn a new Python process — each loading a sentence-transformer
/// model — on every attempt.
static SPAWNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// How long after a spawn the latch stays closed, matching the frontend's own start grace.
const SPAWN_GRACE: Duration = Duration::from_secs(60);

#[tauri::command]
pub fn start_interest_service(app: tauri::AppHandle) -> ServiceStart {
    if service_is_up() {
        SPAWNING.store(false, std::sync::atomic::Ordering::SeqCst);
        return ServiceStart::of("running", String::new(), String::new());
    }
    if SPAWNING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return ServiceStart::of("starting", String::new(), String::new());
    }
    std::thread::spawn(|| {
        std::thread::sleep(SPAWN_GRACE);
        SPAWNING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    let Ok(home) = app.path().home_dir() else {
        return ServiceStart::of("notFound", String::new(), "no home directory".into());
    };
    let Some(script) = find_daemon(&home) else {
        return ServiceStart::of("notFound", String::new(), String::new());
    };
    let working_dir = script.parent().map(PathBuf::from).unwrap_or_else(|| home.clone());
    let log_dir = home.join(".interest-model");
    let _ = std::fs::create_dir_all(&log_dir);
    let log = std::fs::File::create(log_dir.join("service.log")).ok();
    let mut command = std::process::Command::new("python3");
    command.arg(&script).current_dir(&working_dir);
    if let Some(log) = log {
        let Ok(errors) = log.try_clone() else {
            return ServiceStart::of("failed", script.display().to_string(), "log clone".into());
        };
        command.stdout(log).stderr(errors);
    }
    match command.spawn() {
        Ok(_) => ServiceStart::of("starting", script.display().to_string(), String::new()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            ServiceStart::of("pythonMissing", script.display().to_string(), String::new())
        }
        Err(error) => ServiceStart::of("failed", script.display().to_string(), error.to_string()),
    }
}

#[tauri::command]
pub fn read_interest_service_token(app: tauri::AppHandle) -> Option<String> {
    let path = app.path().home_dir().ok()?.join(".interest-model").join("token");
    let token = std::fs::read_to_string(path).ok()?.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}
