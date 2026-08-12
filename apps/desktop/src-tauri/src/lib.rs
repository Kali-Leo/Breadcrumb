// Purpose: Tauri application entry — registers plugins (sql, http, opener) and the
// local embeddings + piper TTS commands. The Rust shell stays thin: business logic lives
// in TS packages.

mod embeddings;
mod tts;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            embeddings::embed_texts,
            tts::piper_synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
