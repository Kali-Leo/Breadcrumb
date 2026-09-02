// Purpose: Tauri application entry — registers plugins (sql, http, opener) and the local
// embeddings + piper TTS + atomic SQL transaction + interest-service token + database-open
// commands. The Rust shell stays thin: business logic lives in TS packages.
//
// The sql plugin is registered without `allow-load` in the capability set: the frontend
// cannot name a database file, it calls open_app_database and gets the one this app owns.

mod embeddings;
mod fsrs_optim;
mod interest_service;
mod open_database;
// Test-only: asserts sqlx still enables foreign keys on every connection it opens.
#[cfg(test)]
mod pragma_defaults;
mod transactions;
mod tts;

/// Addresses the main webview may load. The app serves itself over the `tauri:` protocol
/// (`http(s)://tauri.localhost` on the platforms that need a real origin) and, in development
/// builds only, over the Vite dev server.
///
/// Why this exists: chat messages carry links the model chose, and this window has no address
/// bar — a page loaded in it would be indistinguishable from the app itself, which is a clean
/// phishing surface. Outbound links are handed to the system browser (opener plugin); nothing
/// in the UI needs the webview to navigate anywhere on its own.
fn is_app_url(url: &tauri::Url) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }
    match (url.scheme(), url.host_str(), url.port()) {
        ("http" | "https", Some("tauri.localhost"), _) => true,
        ("http", Some("localhost"), Some(1420)) => cfg!(dev),
        _ => false,
    }
}

/// The navigation guard, carried in as a tiny plugin: `tauri::Builder` has no `on_navigation`
/// hook, and the main window is declared in tauri.conf.json rather than built in Rust, so the
/// plugin hook is the one place Tauri 2 offers to filter navigation for that window.
fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_app_url(url))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(navigation_guard())
        // The configured 1280x800 is a preference, not a demand: on smaller screens the
        // window must open fully visible (a window larger than the monitor cannot even be
        // shrunk by the user on some compositors).
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let scale = monitor.scale_factor();
                    let screen = monitor.size().to_logical::<f64>(scale);
                    let width = f64::min(1280.0, screen.width - 32.0);
                    let height = f64::min(800.0, screen.height - 96.0);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.center();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            embeddings::embed_texts,
            fsrs_optim::optimize_fsrs_parameters,
            interest_service::read_interest_service_token,
            interest_service::start_interest_service,
            open_database::open_app_database,
            transactions::execute_sql_transaction,
            tts::piper_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::is_app_url;
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).expect("test url should parse")
    }

    #[test]
    fn allows_the_pages_this_app_serves() {
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("https://tauri.localhost/index.html")));
    }

    #[test]
    fn refuses_anywhere_else() {
        // The shape of the attack: a link in a model's answer, opened in a window with no
        // address bar.
        assert!(!is_app_url(&url("https://evil.example/login")));
        assert!(!is_app_url(&url("http://127.0.0.1:21456/export")));
        assert!(!is_app_url(&url("file:///etc/passwd")));
        assert!(!is_app_url(&url("https://tauri.localhost.evil.example/")));
    }

    #[test]
    fn allows_the_dev_server_only_in_development_builds() {
        assert_eq!(is_app_url(&url("http://localhost:1420/")), cfg!(dev));
        // Another port on the same host is never the app.
        assert!(!is_app_url(&url("http://localhost:3000/")));
    }
}
