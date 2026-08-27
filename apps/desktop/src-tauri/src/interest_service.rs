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

/// The project is a separate checkout the user cloned themselves, so we look where people
/// actually put it rather than demanding a configured path.
fn find_daemon(home: &PathBuf) -> Option<PathBuf> {
    let mut roots = vec![home.clone()];
    for desktop in ["桌面", "Desktop", "文档", "Documents", "projects", "code"] {
        roots.push(home.join(desktop));
    }
    for root in roots {
        for project in ["bilibili", "feed-mode", "interest-model"] {
            let candidate = root.join(project).join(DAEMON_RELATIVE_PATH);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        // One level of "some folder that contains the project" — cheap and covers a
        // checkout sitting inside a workspace folder.
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let candidate = entry.path().join(DAEMON_RELATIVE_PATH);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[tauri::command]
pub fn start_interest_service(app: tauri::AppHandle) -> ServiceStart {
    if service_is_up() {
        return ServiceStart::of("running", String::new(), String::new());
    }
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
