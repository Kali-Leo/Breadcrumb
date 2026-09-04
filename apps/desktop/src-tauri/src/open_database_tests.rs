// Purpose: the tests for open_database.rs. They live beside it rather than inside it because
// this crate holds every source file to the same 200-line ceiling and the rules worth pinning
// here need a real pool map, a real file on disk and ten real connections to pin them.
//
// What they pin: that every connection the pool hands out is armed (not just the first), that
// a pool the webview closed is rebuilt instead of being reported as open forever, and that the
// -wal file WAL brought with it is no more readable than the database itself.

use crate::open_database::{register_pool, DATABASE_KEY, MAX_CONNECTIONS};
use crate::pragma_defaults::BUSY_TIMEOUT_MS;
use sqlx::Row;
use tauri_plugin_sql::{DbInstances, DbPool};

struct Scratch(std::path::PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir()
            .join(format!("breadcrumb-open-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        Self(dir)
    }
    fn db(&self) -> std::path::PathBuf {
        self.0.join("breadcrumb.db")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

fn instances() -> DbInstances {
    DbInstances(tauri::async_runtime::RwLock::new(std::collections::HashMap::new()))
}

fn sqlite(map: &std::collections::HashMap<String, DbPool>) -> &sqlx::SqlitePool {
    match map.get(DATABASE_KEY).expect("the pool should be registered") {
        DbPool::Sqlite(pool) => pool,
    }
}

/// The reach the frontend's own PRAGMA calls never had: not "a connection", but every
/// connection the pool will hand out. Ten are held open at once so the pool has to create
/// all ten, and each is asked what it is actually running.
#[test]
fn every_connection_the_pool_opens_is_armed() {
    tauri::async_runtime::block_on(async {
        let scratch = Scratch::new("armed");
        let map = instances();
        register_pool(&map, &scratch.db()).await.expect("open should succeed");
        let held = map.0.read().await;
        let pool = sqlite(&held);
        let mut connections = Vec::new();
        for _ in 0..MAX_CONNECTIONS {
            connections.push(pool.acquire().await.expect("a connection"));
        }
        for connection in connections.iter_mut() {
            let mode: String = sqlx::query("PRAGMA journal_mode")
                .fetch_one(&mut **connection)
                .await
                .expect("row")
                .get(0);
            let synchronous: i64 = sqlx::query("PRAGMA synchronous")
                .fetch_one(&mut **connection)
                .await
                .expect("row")
                .get(0);
            let timeout: i64 = sqlx::query("PRAGMA busy_timeout")
                .fetch_one(&mut **connection)
                .await
                .expect("row")
                .get(0);
            assert_eq!(mode.to_lowercase(), "wal");
            assert_eq!(synchronous, 1, "NORMAL, which WAL is what makes safe");
            assert_eq!(timeout, BUSY_TIMEOUT_MS);
        }
    });
}

/// One `db.close()` from the webview used to end the session's database for good: the
/// plugin closes the pool but leaves the key, and this command answered `contains_key`
/// with success while every query after it failed.
#[test]
fn a_closed_pool_is_replaced_rather_than_reported_as_open() {
    tauri::async_runtime::block_on(async {
        let scratch = Scratch::new("closed");
        let map = instances();
        register_pool(&map, &scratch.db()).await.expect("open should succeed");
        sqlite(&*map.0.read().await).close().await;

        register_pool(&map, &scratch.db()).await.expect("reopen should succeed");
        let held = map.0.read().await;
        let row = sqlx::query("SELECT 1 AS one")
            .fetch_one(sqlite(&held))
            .await
            .expect("the reopened database must serve queries");
        assert_eq!(row.get::<i64, _>(0), 1);
    });
}

/// Reopening an already-working database is still free: the same pool comes back.
#[test]
fn a_working_pool_is_reused() {
    tauri::async_runtime::block_on(async {
        let scratch = Scratch::new("reuse");
        let map = instances();
        register_pool(&map, &scratch.db()).await.expect("open");
        let first = sqlite(&*map.0.read().await).clone();
        register_pool(&map, &scratch.db()).await.expect("reopen");
        assert!(sqlite(&*map.0.read().await).is_closed() == first.is_closed());
        assert_eq!(map.0.read().await.len(), 1);
    });
}

/// The -wal file holds the transactions that have not made it into the main file yet —
/// the newest of the learner's conversations. It must not be the one file left world
/// readable.
#[cfg(unix)]
#[test]
fn the_wal_sidecar_is_no_more_readable_than_the_database() {
    tauri::async_runtime::block_on(async {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new("modes");
        let map = instances();
        register_pool(&map, &scratch.db()).await.expect("open");
        let held = map.0.read().await;
        sqlx::query("CREATE TABLE t (a)").execute(sqlite(&held)).await.expect("write");
        let wal = scratch.0.join("breadcrumb.db-wal");
        let mode = std::fs::metadata(&wal).expect("the -wal file should exist").permissions();
        assert_eq!(mode.mode() & 0o777, 0o600, "-wal must be owner-only");
    });
}
