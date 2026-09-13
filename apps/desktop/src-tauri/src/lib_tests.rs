// Purpose: the tests for lib.rs — the two things the shell itself promises. That the main
// webview will not navigate anywhere but the pages this app serves, and that the capability
// set hands the renderer nothing beyond what a screen actually calls. Beside the module
// because this crate holds every source file to the same 200-line ceiling.

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
    assert!(!is_app_url(&url("http://127.0.0.1:8080/anything")));
    assert!(!is_app_url(&url("file:///etc/passwd")));
    assert!(!is_app_url(&url("https://tauri.localhost.evil.example/")));
}

#[test]
fn allows_the_dev_server_only_in_development_builds() {
    assert_eq!(is_app_url(&url("http://localhost:1420/")), cfg!(dev));
    // Another port on the same host is never the app.
    assert!(!is_app_url(&url("http://localhost:3000/")));
}

/// `sql:allow-close` is deliberately absent, and this is the test that keeps it absent.
///
/// The plugin's close command closes the pool and leaves the key in its map. Rust rebuilds
/// a closed pool now (open_database.rs), so this is no longer the session-ending bug it
/// was — but nothing in the frontend has ever called it: `@tauri-apps/plugin-sql` is
/// imported in exactly one file, apps/desktop/src/lib/platform/db.ts, which never closes
/// anything. A permission with no caller is only a way in.
#[test]
fn the_capability_set_grants_nothing_the_frontend_does_not_call() {
    let capabilities = include_str!("../capabilities/default.json");
    assert!(
        !capabilities.contains("sql:allow-close"),
        "nothing in the app closes the database; granting the renderer the ability to is \
         a way to end a session, not a feature"
    );
    // The two that are called, on every screen.
    assert!(capabilities.contains("sql:allow-execute"));
    assert!(capabilities.contains("sql:allow-select"));
    // The reason open_app_database exists at all (see open_database.rs).
    assert!(!capabilities.contains("sql:allow-load"));
    assert!(!capabilities.contains("sql:default"));
}

/// Importing a file someone owns needs a picker and one read. Everything else the fs
/// plugin can do is a way to change or enumerate their disk, which no screen in this app
/// asks for — and `fs:default` would hand over a good deal of it in one word.
///
/// Read out of the parsed permission list rather than searched for in the text, because
/// the file's own description names the withheld permissions in order to say they are
/// withheld, and a substring search cannot tell that sentence from a grant.
#[test]
fn the_filesystem_grant_is_read_only_and_stays_that_way() {
    let granted = granted_permissions();
    assert!(granted.contains(&"dialog:allow-open".to_string()));
    assert!(granted.contains(&"fs:allow-read-file".to_string()));
    for identifier in &granted {
        let (plugin, _) = identifier.split_once(':').unwrap_or(("", ""));
        if plugin != "fs" && plugin != "dialog" {
            continue;
        }
        assert!(
            identifier == "fs:allow-read-file" || identifier == "dialog:allow-open",
            "{identifier} is more than importing a document needs"
        );
    }
    // Where a bought e-book or a handout sits — and not the home directory around them.
    let scope = capability_json()["permissions"].to_string();
    for folder in ["$DOCUMENT/**", "$DOWNLOAD/**", "$DESKTOP/**"] {
        assert!(scope.contains(folder), "{folder} is where the documents are");
    }
    assert!(!scope.contains("$HOME"), "dotfiles and keys are not documents");
}

fn capability_json() -> serde_json::Value {
    serde_json::from_str(include_str!("../capabilities/default.json"))
        .expect("the capability file is JSON the Tauri build also has to parse")
}

/// Permission entries come in two shapes: a bare identifier string, or an object carrying
/// the identifier plus its scope.
fn granted_permissions() -> Vec<String> {
    capability_json()["permissions"]
        .as_array()
        .expect("permissions is a list")
        .iter()
        .map(|entry| match entry {
            serde_json::Value::String(identifier) => identifier.clone(),
            other => other["identifier"]
                .as_str()
                .expect("a scoped permission names one")
                .to_string(),
        })
        .collect()
}
