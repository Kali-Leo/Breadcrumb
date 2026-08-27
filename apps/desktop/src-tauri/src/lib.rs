// Purpose: Tauri application entry — registers plugins (sql, http, opener) and the
// local embeddings + piper TTS + atomic SQL transaction + interest-service token commands. The Rust shell stays
// thin: business logic lives in TS packages.

mod embeddings;
mod fsrs_optim;
mod interest_service;
mod transactions;
mod tts;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            transactions::execute_sql_transaction,
            tts::piper_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
