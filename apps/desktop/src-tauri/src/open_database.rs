// Purpose: opens the app's own SQLite database from Rust and registers it under
// tauri-plugin-sql's pool map, so the frontend never needs the plugin's `load` command.
//
// SECURITY: this exists to let `sql:allow-load` be dropped from the capability set. The
// plugin's load command takes a connection string from the webview and resolves it with
// PathBuf::push, which an absolute path REPLACES — so `sqlite:/home/you/.mozilla/.../
// cookies.sqlite` opened that file, and with `sql:allow-execute` also granted, any script in
// the renderer could read and modify any SQLite database on the machine. Choosing the path
// in Rust removes the parameter that made that possible: the frontend can now only ever talk
// to the one database this command opened.
// Main exports: open_app_database (Tauri command), DATABASE_KEY.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};

/// The key the pool is registered under. The frontend passes this same string to the
/// plugin's select/execute commands and to execute_sql_transaction; it is an opaque handle,
/// not a path, and nothing derives a filesystem location from it.
pub const DATABASE_KEY: &str = "sqlite:breadcrumb.db";

/// The plugin's own default: enough connections for the app's concurrent reads without
/// letting a runaway caller open an unbounded number.
const MAX_CONNECTIONS: u32 = 10;

/// Opens (creating if absent) the app database in the app's config directory and registers
/// the pool. Idempotent: calling it again returns the key without reopening.
#[tauri::command]
pub async fn open_app_database(
    app: tauri::AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<String, String> {
    {
        let instances = db_instances.0.read().await;
        if instances.contains_key(DATABASE_KEY) {
            return Ok(DATABASE_KEY.to_string());
        }
    }

    let config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    let path = config_dir.join("breadcrumb.db");

    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        // The schema relies on foreign keys; sqlx enables them by default and
        // pragma_defaults.rs pins that, but stating it here makes the guarantee local.
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect_with(options)
        .await
        .map_err(|error| format!("failed to open the database: {error}"))?;

    restrict_permissions(&path);

    let mut instances = db_instances.0.write().await;
    instances.insert(DATABASE_KEY.to_string(), DbPool::Sqlite(pool));
    Ok(DATABASE_KEY.to_string())
}

/// The database holds every conversation the learner has had. On a machine with more than
/// one account the default 0644 leaves that readable by all of them; the parent directory
/// usually prevents it, but the guarantee should not rest on a directory somebody else owns.
#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) {}
