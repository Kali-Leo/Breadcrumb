// Purpose: the per-connection SQLite settings this app's durability and referential integrity
// rest on, applied to EVERY connection the pool opens, plus the tests that pin them.
//
// Why every connection and not "the one we happened to send them on": pragmas are per
// connection, tauri-plugin-sql's pool holds up to ten, and sqlx returns a connection to the
// pool asynchronously — so two PRAGMA statements sent back to back from the frontend land on
// two different connections and the statement after them on a third. The only place that can
// arm all of them is SqlitePoolOptions::after_connect, which is why this lives in Rust.
//
// Main exports: arm_connection, BUSY_TIMEOUT_MS.

use sqlx::{Row, SqliteConnection};

/// Restated at sqlx's own default so a dependency change cannot silently shorten it. Ten
/// connections contend for one file; a writer that gives up instantly is a failed save.
pub const BUSY_TIMEOUT_MS: i64 = 5_000;

/// Applies the settings to one freshly opened connection.
///
/// Order matters. busy_timeout goes first because `PRAGMA journal_mode` needs a lock the other
/// connections may be holding, and a connection that has not been told to wait would answer
/// SQLITE_BUSY instead of switching the file over.
///
/// WAL, and the fallback: `synchronous = NORMAL` is only the documented-safe setting under WAL,
/// where a crash costs the last few committed transactions but cannot corrupt the file. Under
/// the rollback journal — because sqlx does not set journal_mode unless asked — NORMAL is the
/// setting that can corrupt the database on power loss. So the mode is requested here, the
/// answer SQLite gives back is read, and `synchronous` is chosen from what it actually says:
/// WAL earns NORMAL, anything else (a network filesystem, a read-only directory, an in-memory
/// database) gets FULL. The app never runs on the unsafe combination, whichever way it lands.
pub async fn arm_connection(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    sqlx::query(&format!("PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}"))
        .execute(&mut *conn)
        .await?;
    let mode: String = sqlx::query("PRAGMA journal_mode = WAL")
        .fetch_one(&mut *conn)
        .await?
        .get(0);
    let synchronous = if mode.eq_ignore_ascii_case("wal") { "NORMAL" } else { "FULL" };
    sqlx::query(&format!("PRAGMA synchronous = {synchronous}"))
        .execute(&mut *conn)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{arm_connection, BUSY_TIMEOUT_MS};
    use sqlx::sqlite::SqlitePool;
    use sqlx::Row;

    async fn pragma(pool: &SqlitePool, name: &str) -> String {
        sqlx::query(&format!("PRAGMA {name}"))
            .fetch_one(pool)
            .await
            .unwrap_or_else(|error| panic!("PRAGMA {name} should return a row: {error}"))
            .get::<i64, _>(0)
            .to_string()
    }

    /// Opens a pool exactly the way tauri-plugin-sql does — `Pool::connect(<url>)`, no options
    /// touched — against an in-memory database, and asks the connection what it thinks.
    #[test]
    fn sqlx_enables_foreign_keys_on_every_connection() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePool::connect("sqlite::memory:")
                .await
                .expect("in-memory sqlite pool should open");
            assert_eq!(
                pragma(&pool, "foreign_keys").await,
                "1",
                "sqlx no longer enables foreign keys by default. Every DELETE that this app \
                 relies on being blocked (node merges above all) is now silently leaving orphan \
                 rows. Send PRAGMA foreign_keys=ON from arm_connection before shipping this \
                 dependency bump."
            );
            pool.close().await;
        });
    }

    /// The default that was assumed rather than pinned, and had quietly not been true: sqlx
    /// leaves journal_mode alone unless it is asked (sqlx-sqlite/src/options/mod.rs). This test
    /// is here so that if a future sqlx starts setting WAL for us, arm_connection's fallback
    /// branch is revisited rather than left as dead weight — and so nobody assumes WAL again
    /// without asking for it.
    #[test]
    fn sqlx_does_not_choose_a_journal_mode_of_its_own() {
        tauri::async_runtime::block_on(async {
            let dir = std::env::temp_dir().join(format!("breadcrumb-pragma-{}", std::process::id()));
            std::fs::create_dir_all(&dir).expect("temp dir");
            let path = dir.join("plain.db");
            let pool = SqlitePool::connect(&format!("sqlite:{}?mode=rwc", path.display()))
                .await
                .expect("file-backed pool should open");
            let mode: String = sqlx::query("PRAGMA journal_mode")
                .fetch_one(&pool)
                .await
                .expect("row")
                .get(0);
            pool.close().await;
            std::fs::remove_dir_all(&dir).ok();
            assert_eq!(
                mode.to_lowercase(),
                "delete",
                "sqlx now picks a journal mode of its own. arm_connection assumes it does not."
            );
        });
    }

    /// A file-backed database armed by arm_connection is on the safe combination: WAL, and
    /// therefore synchronous = NORMAL rather than the corruption-on-power-loss pairing.
    #[test]
    fn arms_wal_and_the_synchronous_level_wal_makes_safe() {
        tauri::async_runtime::block_on(async {
            let dir = std::env::temp_dir().join(format!("breadcrumb-wal-{}", std::process::id()));
            std::fs::create_dir_all(&dir).expect("temp dir");
            let path = dir.join("armed.db");
            let mut conn = <sqlx::SqliteConnection as sqlx::Connection>::connect(&format!(
                "sqlite:{}?mode=rwc",
                path.display()
            ))
            .await
            .expect("connection should open");
            arm_connection(&mut conn).await.expect("arming should succeed");
            let mode: String =
                sqlx::query("PRAGMA journal_mode").fetch_one(&mut conn).await.expect("row").get(0);
            let synchronous: i64 =
                sqlx::query("PRAGMA synchronous").fetch_one(&mut conn).await.expect("row").get(0);
            let timeout: i64 =
                sqlx::query("PRAGMA busy_timeout").fetch_one(&mut conn).await.expect("row").get(0);
            std::fs::remove_dir_all(&dir).ok();
            assert_eq!(mode.to_lowercase(), "wal", "the database must be in WAL mode");
            // 1 = NORMAL. Safe only under WAL, which the line above just established.
            assert_eq!(synchronous, 1, "synchronous should be NORMAL under WAL");
            assert_eq!(timeout, BUSY_TIMEOUT_MS);
        });
    }

    /// The fallback. An in-memory database cannot be WAL, so arming one must land on FULL —
    /// never on the NORMAL-without-WAL pairing that loses the file on power loss.
    #[test]
    fn falls_back_to_full_when_wal_is_refused() {
        tauri::async_runtime::block_on(async {
            let mut conn =
                <sqlx::SqliteConnection as sqlx::Connection>::connect("sqlite::memory:")
                    .await
                    .expect("in-memory connection should open");
            arm_connection(&mut conn).await.expect("arming should succeed");
            let mode: String =
                sqlx::query("PRAGMA journal_mode").fetch_one(&mut conn).await.expect("row").get(0);
            let synchronous: i64 =
                sqlx::query("PRAGMA synchronous").fetch_one(&mut conn).await.expect("row").get(0);
            assert_ne!(mode.to_lowercase(), "wal", "an in-memory database cannot be WAL");
            // 2 = FULL.
            assert_eq!(synchronous, 2, "without WAL the only safe level is FULL");
        });
    }
}
