// Purpose: Tauri application entry — registers plugins (sql, http, opener, dialog, fs) and
// the local embeddings + reranking + piper TTS + atomic SQL transaction + browsing-collector
// + database-open commands. The Rust shell stays thin: business logic lives in TS packages.
//
// The sql plugin is registered without `allow-load` in the capability set: the frontend
// cannot name a database file, it calls open_app_database and gets the one this app owns.
//
// dialog and fs are registered for one job: letting someone open a PDF, .txt or .md they
// already own and import it. What the capability set grants them is the minimum that does
// that job — `dialog:allow-open` and `fs:allow-read-file`, the latter scoped to the documents,
// downloads and desktop folders. Withheld deliberately: every write and delete command, the
// directory-listing commands (which would let the renderer enumerate someone's files without
// them choosing any), and `$HOME/**`, which would put dotfiles and keys in reach. The
// capability file repeats this, and the test at the bottom keeps it true.

mod collector;
mod collector_http;
#[cfg(test)]
mod collector_tests;
mod embeddings;
mod fsrs_optim;
// Fetching a model's files once, checking they are whole, and refusing to fetch them behind
// a switched-off network. Shared by the embedder and the reranker.
mod model_download;
mod model_files;
mod open_database;
#[cfg(test)]
mod open_database_tests;
// The per-connection settings the pool arms every connection with, and the tests that pin
// both them and the sqlx defaults underneath them.
mod pragma_defaults;
mod reranker;
mod transactions;
mod tts;
// The renderer-supplied path checks tts.rs runs before it executes anything.
mod tts_paths;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            embeddings::embed_texts,
            reranker::rerank_pairs,
            fsrs_optim::optimize_fsrs_parameters,
            collector::browsing_collector_info,
            collector::take_browsing_events,
            open_database::open_app_database,
            transactions::execute_sql_transaction,
            tts::piper_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
