// Purpose: the execute_sql_transaction command — runs a batch of SQL statements atomically
// inside ONE real sqlx transaction on tauri-plugin-sql's own connection pool.
// Why it exists: the plugin's pool holds up to 10 sqlite connections (sqlx default) and its
// execute command checks a connection out per call, so BEGIN/COMMIT issued as separate
// frontend execute() calls would land on different connections and never form a transaction.
// The plugin exports its state publicly (DbInstances, DbPool), so this sibling command can
// borrow the exact same pool and hold one connection for the whole batch.

use serde::Deserialize;
use serde_json::Value as JsonValue;
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

/// Separate from the command so it can be tested without a database: the command itself needs
/// a live pool, this rule does not.
fn check_batch_size(count: usize) -> Result<(), String> {
    if count > MAX_STATEMENTS {
        return Err(format!("too many statements in one transaction (limit {MAX_STATEMENTS})"));
    }
    Ok(())
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
    check_batch_size(statements.len())?;
    let instances = db_instances.0.read().await;
    let pool = match instances
        .get(&db)
        .ok_or_else(|| format!("database {db} not loaded"))?
    {
        DbPool::Sqlite(pool) => pool,
    };

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("failed to begin transaction: {error}"))?;
    for statement in statements {
        let mut query = sqlx::query(&statement.sql);
        // Bind exactly like tauri-plugin-sql's own execute path (wrapper.rs), so a statement
        // behaves identically whether it runs standalone or inside a transaction.
        for value in statement.params {
            if value.is_null() {
                query = query.bind(None::<JsonValue>);
            } else if value.is_string() {
                query = query.bind(value.as_str().unwrap().to_owned());
            } else if let Some(number) = value.as_number() {
                query = query.bind(number.as_f64().unwrap_or_default());
            } else {
                query = query.bind(value);
            }
        }
        query
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
mod tests {
    use super::{check_batch_size, MAX_STATEMENTS};

    #[test]
    fn accepts_a_real_batch_and_refuses_an_unbounded_one() {
        assert!(check_batch_size(0).is_ok());
        assert!(check_batch_size(MAX_STATEMENTS).is_ok());
        assert!(check_batch_size(MAX_STATEMENTS + 1).is_err());
    }
}
