// Purpose: the tests for transactions.rs. Beside it rather than inside it because this crate
// holds every source file to the same 200-line ceiling, and the two rules worth pinning here
// — that a batch cannot end its own transaction, and that a value comes back out of SQLite as
// the type it went in as — both need a real database to be worth anything.

use super::{bind_params, check_batch_size, check_statement, run_batch, MAX_STATEMENTS, TransactionStatement};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;

async fn scratch_database() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.expect("in-memory pool");
    sqlx::query("CREATE TABLE t (id INTEGER, flag INTEGER, label TEXT)")
        .execute(&pool)
        .await
        .expect("schema");
    pool
}

#[test]
fn accepts_a_real_batch_and_refuses_an_unbounded_one() {
    assert!(check_batch_size(0).is_ok());
    assert!(check_batch_size(MAX_STATEMENTS).is_ok());
    assert!(check_batch_size(MAX_STATEMENTS + 1).is_err());
}

/// The shapes the app actually sends — every migration and every repository batch — stay
/// acceptable. A rule that rejected them would be a worse bug than the one it fixes.
#[test]
fn accepts_the_statements_this_app_sends() {
    for sql in [
        "INSERT INTO t (id) VALUES (?)",
        "  UPDATE t SET label = ? WHERE id = ?  ",
        "DELETE FROM t WHERE id = ?;",
        "CREATE TABLE IF NOT EXISTS x (a TEXT)",
        "CREATE INDEX idx ON t (id)",
        "SELECT 1",
    ] {
        assert!(check_statement(sql).is_ok(), "should accept: {sql}");
    }
}

/// A `COMMIT` inside the batch used to end the transaction early: the batch still reported the
/// later failure, but the rollback had nothing left to roll back and the earlier writes stayed.
#[test]
fn refuses_a_statement_that_would_end_the_transaction() {
    for sql in [
        "COMMIT",
        "commit;",
        " Begin ",
        "ROLLBACK",
        "END",
        "SAVEPOINT a",
        "RELEASE a",
        "VACUUM",
        "ATTACH DATABASE 'other.db' AS other",
        "DETACH other",
        "PRAGMA journal_mode = DELETE",
    ] {
        assert!(check_statement(sql).is_err(), "should refuse: {sql}");
    }
}

/// A single string holding several statements runs all of them while the parameters bind only
/// to the first, so the batch that was rolled back is not the batch that ran.
#[test]
fn refuses_several_statements_smuggled_into_one_string() {
    assert!(check_statement("INSERT INTO t (id) VALUES (?); INSERT INTO t (id) VALUES (2)").is_err());
    assert!(check_statement("INSERT INTO t (id) VALUES (1); COMMIT;").is_err());
    assert!(check_statement("SELECT 1;;").is_err());
}

/// A boolean used to reach SQLite as the TEXT `"true"`, which an INTEGER column accepts and
/// `WHERE flag = 1` then never finds again: the row was written and lost in one step.
#[test]
fn a_boolean_is_stored_as_the_integer_the_schema_expects() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        bind_params(
            sqlx::query("INSERT INTO t (id, flag) VALUES (?, ?)"),
            vec![serde_json::json!(1), serde_json::json!(true)],
        )
        .execute(&pool)
        .await
        .expect("insert");
        let row = sqlx::query("SELECT flag, typeof(flag) AS kind FROM t")
            .fetch_one(&pool)
            .await
            .expect("row");
        assert_eq!(row.get::<i64, _>("flag"), 1);
        assert_eq!(row.get::<String, _>("kind"), "integer");
        let found: i64 = sqlx::query("SELECT count(*) FROM t WHERE flag = 1")
            .fetch_one(&pool)
            .await
            .expect("row")
            .get(0);
        assert_eq!(found, 1, "a row written as a boolean must still be findable");
    });
}

/// Every number used to be bound as f64: an id past 2^53 came back with its last digits
/// changed, and a plain integer landed in a TEXT column as "7.0".
#[test]
fn an_integer_keeps_its_value_and_its_type() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        bind_params(
            sqlx::query("INSERT INTO t (id, label) VALUES (?, ?)"),
            vec![serde_json::json!(9_007_199_254_740_993i64), serde_json::json!(7)],
        )
        .execute(&pool)
        .await
        .expect("insert");
        let row = sqlx::query("SELECT id, label FROM t").fetch_one(&pool).await.expect("row");
        assert_eq!(row.get::<i64, _>("id"), 9_007_199_254_740_993);
        assert_eq!(row.get::<String, _>("label"), "7");
    });
}

/// Fractions are still fractions, and null is still null.
#[test]
fn the_other_json_kinds_survive_unchanged() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        bind_params(
            sqlx::query("INSERT INTO t (id, flag, label) VALUES (?, ?, ?)"),
            vec![serde_json::json!(1.5), serde_json::json!(null), serde_json::json!("text")],
        )
        .execute(&pool)
        .await
        .expect("insert");
        let row = sqlx::query("SELECT id, flag, label FROM t").fetch_one(&pool).await.expect("row");
        assert_eq!(row.get::<f64, _>("id"), 1.5);
        assert_eq!(row.get::<Option<i64>, _>("flag"), None);
        assert_eq!(row.get::<String, _>("label"), "text");
    });
}

fn statement(sql: &str) -> TransactionStatement {
    TransactionStatement { sql: sql.to_string(), params: Vec::new() }
}

async fn rows_in_t(pool: &SqlitePool) -> i64 {
    sqlx::query("SELECT count(*) FROM t").fetch_one(pool).await.expect("row").get(0)
}

/// The control: an ordinary batch whose last statement fails leaves nothing behind.
#[test]
fn a_failing_statement_rolls_the_whole_batch_back() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        let failed = run_batch(
            &pool,
            vec![
                statement("INSERT INTO t (id) VALUES (1)"),
                statement("INSERT INTO nowhere (id) VALUES (2)"),
            ],
        )
        .await;
        assert!(failed.is_err());
        assert_eq!(rows_in_t(&pool).await, 0, "the first insert must not survive");
    });
}

/// The bug end to end: with a COMMIT in the middle, the batch still reported the later
/// failure while the rows written before the COMMIT stayed in the database. Refusing the
/// batch outright is what keeps the report and the database saying the same thing.
#[test]
fn a_commit_inside_the_batch_is_refused_before_anything_runs() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        let refused = run_batch(
            &pool,
            vec![
                statement("INSERT INTO t (id) VALUES (1)"),
                statement("COMMIT"),
                statement("INSERT INTO nowhere (id) VALUES (2)"),
            ],
        )
        .await;
        assert!(refused.is_err());
        assert_eq!(rows_in_t(&pool).await, 0, "a refused batch must write nothing at all");
    });
}

/// And the other half: several statements packed into one string used to run in full while
/// the parameters bound only to the first.
#[test]
fn statements_packed_into_one_string_are_refused_before_anything_runs() {
    tauri::async_runtime::block_on(async {
        let pool = scratch_database().await;
        let refused = run_batch(
            &pool,
            vec![statement("INSERT INTO t (id) VALUES (1); INSERT INTO t (id) VALUES (2)")],
        )
        .await;
        assert!(refused.is_err());
        assert_eq!(rows_in_t(&pool).await, 0);
    });
}
