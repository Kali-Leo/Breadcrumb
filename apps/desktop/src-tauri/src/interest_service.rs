// Purpose: read the connection token of the local browsing-interest service so the
// discovery page can offer it for copying. The service writes it to
// ~/.interest-model/token on first run. One file, read-only — deliberately a command
// instead of the fs plugin, which would open the whole home directory.

use tauri::Manager;

#[tauri::command]
pub fn read_interest_service_token(app: tauri::AppHandle) -> Option<String> {
    let path = app
        .path()
        .home_dir()
        .ok()?
        .join(".interest-model")
        .join("token");
    let token = std::fs::read_to_string(path).ok()?.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}
