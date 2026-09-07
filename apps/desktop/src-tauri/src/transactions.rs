// Purpose: the execute_sql_transaction command — runs a batch of SQL statements atomically
// inside ONE real sqlx transaction on tauri-plugin-sql's own connection pool.
// Why it exists: the plugin's pool holds up to 10 sqlite connections (sqlx default) and its
// execute command checks a connection out per call, so BEGIN/COMMIT issued as separate
// frontend execute() calls would land on different connections and never form a transaction.
// The plugin exports its state publicly (DbInstances, DbPool), so this sibling command can
// borrow the exact same pool and hold one connection for the whole batch.
// Main exports: execute_sql_transaction (Tauri command), TransactionStatement.

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{query::Query, sqlite::SqliteArguments, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

/// One statement of the batch; `params` uses the same JSON encoding as the plugin's
/// execute command.
#[derive(Deserialize)]
pub struct TransactionStatement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

/// Ceiling on one batch. Every statement holds the same pooled connection for the whole
/// transaction, so an unbounded batch from the renderer is a lock the rest of the app queues
/// behind. The app's own batches are one migration or one screen's worth of writes.
const MAX_STATEMENTS: usize = 10_000;

/// Statements that end the transaction this command opened, rather than running inside it.
/// COMMIT is the one that actually costs the guarantee — after it, the surviving `Transaction`
/// value has nothing left to roll back, so a later statement's failure drops an empty
/// transaction and every earlier write stays. The rest are here because SQLite either refuses
/// them inside a transaction or commits first to run them.
const TRANSACTION_CONTROL: [&str; 10] = [
    "begin", "commit", "end", "rollback", "savepoint", "release", "vacuum", "attach", "detach",
    "pragma",
];

/// Separate from the command so it can be tested without a database: the command itself needs
/// a live pool, this rule does not.
fn check_batch_size(count: usize) -> Result<(), String> {
    if count > MAX_STATEMENTS {
        return Err(format!("too many statements in one transaction (limit {MAX_STATEMENTS})"));
    }
    Ok(())
}

/// The rule that makes "all of it or none of it" true rather than merely intended.
///
/// Two ways a batch could break its own atomicity. A statement whose
/// text IS `COMMIT` ends the transaction early and a later failure then rolls back nothing. A
/// statement that packs several together with `;` runs all of them while binding the parameters
/// to only the first — so a batch that looks like one row silently writes several, and a rolled
/// back batch was never the batch anyone read.
///
/// One trailing semicolon is allowed because it terminates nothing; anything after it does.
/// A statement that genuinely needs a semicolon in a value passes it as a bound parameter,
/// which is what every caller in this app already does.
fn check_statement(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim();
    let body = trimmed.strip_suffix(';').unwrap_or(trimmed);
    if body.contains(';') {
        return Err("a transaction statement may not contain more than one statement".to_string());
    }
    let keyword: String = body
        .chars()
        .take_while(|character| character.is_ascii_alphabetic())
        .flat_map(char::to_lowercase)
        .collect();
    if TRANSACTION_CONTROL.contains(&keyword.as_str()) {
        return Err(format!("{keyword} cannot run inside a transaction batch"));
    }
    Ok(())
}

/// Binds one statement's parameters.
///
/// Numbers and booleans are handled by kind rather than handed to serde_json's own encoder,
/// which tauri-plugin-sql's execute path does and which is wrong in two ways this app can
/// afford to fix locally. A boolean fell through to the JSON encoder and reached SQLite as the
/// TEXT `"true"`: it goes into an INTEGER column happily, and then `WHERE flag = 1` never finds
/// the row again. And every number was bound as f64, so an integer past 2^53 lost its last
/// digits and a plain `7` landed in a TEXT column as `"7.0"`.
fn bind_params<'q>(
    mut query: Query<'q, Sqlite, SqliteArguments<'q>>,
    params: Vec<JsonValue>,
) -> Query<'q, Sqlite, SqliteArguments<'q>> {
    for value in params {
        query = match value {
            JsonValue::Null => query.bind(None::<String>),
            JsonValue::Bool(flag) => query.bind(i64::from(flag)),
            JsonValue::String(text) => query.bind(text),
            JsonValue::Number(number) => match number.as_i64() {
                Some(integer) => query.bind(integer),
                None => query.bind(number.as_f64().unwrap_or_default()),
            },
            other => query.bind(other),
        };
    }
    query
}

/// Runs every statement inside one sqlx transaction on one pooled connection. On any
/// statement error the transaction is dropped before commit, which rolls it back — either
/// the whole batch persists or none of it does. `db` is the same connection string the
/// frontend passed to Database.load (the key the plugin stores the pool under).
#[tauri::command]
pub async fn execute_sql_transaction(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<TransactionStatement>,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let pool = match instances
        .get(&db)
        .ok_or_else(|| format!("database {db} not loaded"))?
    {
        DbPool::Sqlite(pool) => pool,
    };
    run_batch(pool, statements).await
}

/// The command without the Tauri State, so the guarantee it exists for — all of the batch or
/// none of it — can be tested against a real database.
async fn run_batch(
    pool: &sqlx::SqlitePool,
    statements: Vec<TransactionStatement>,
) -> Result<(), String> {
    check_batch_size(statements.len())?;
    for statement in &statements {
        check_statement(&statement.sql)?;
    }
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("failed to begin transaction: {error}"))?;
    for statement in statements {
        bind_params(sqlx::query(&statement.sql), statement.params)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("transaction statement failed: {error}"))?;
        // On the error path `transaction` is dropped un-committed here, which rolls back.
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("failed to commit transaction: {error}"))
}

#[cfg(test)]
#[path = "transactions_tests.rs"]
mod tests;
