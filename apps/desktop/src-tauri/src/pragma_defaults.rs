// Purpose: pins the one dependency default this app's referential integrity rests on.
// Nothing in this repository ever sends `PRAGMA foreign_keys=ON`; foreign keys are enforced
// only because sqlx puts that pragma in SqliteConnectOptions' default set and replays it on
// every connection it opens (sqlx-sqlite-0.8.6/src/options/mod.rs:183). Setting it from the
// frontend is not an option — it is per-connection and tauri-plugin-sql's pool holds up to ten
// connections — so the guarantee genuinely lives in the dependency, and the only honest way to
// hold it is to assert it. Without this test, an upgrade that flipped the default would drop
// referential integrity across the whole schema with every suite still green (design audit
// 2026-08-28, 数据层与性能 #4).
// This module is test-only: it declares no runtime code.

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePool;
    use sqlx::Row;

    /// Opens a pool exactly the way tauri-plugin-sql does — `Pool::connect(<url>)`, no options
    /// touched — against an in-memory database, and asks the connection what it thinks.
    #[test]
    fn sqlx_enables_foreign_keys_on_every_connection() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePool::connect("sqlite::memory:")
                .await
                .expect("in-memory sqlite pool should open");
            let row = sqlx::query("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .expect("PRAGMA foreign_keys should return a row");
            let enabled: i64 = row.get(0);
            assert_eq!(
                enabled, 1,
                "sqlx no longer enables foreign keys by default. Every DELETE that this app \
                 relies on being blocked (node merges above all) is now silently leaving orphan \
                 rows. Send PRAGMA foreign_keys=ON from SqlitePoolOptions::after_connect before \
                 shipping this dependency bump."
            );
            pool.close().await;
        });
    }
}
