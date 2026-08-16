/**
 * Purpose: builds a complete SqlClient from a select/execute-only base by running each
 * executeTransaction batch as a plain sequential loop — NOT atomic, so it is only for
 * in-memory test fakes (whose Maps/arrays cannot crash mid-batch anyway); real hosts must
 * implement a genuine transaction (desktop: the execute_sql_transaction Tauri command;
 * simlab: better-sqlite3's transaction()).
 * Main exports: withSequentialTransactions, TransactionlessSqlClient.
 */
import type { SqlClient, SqlTransactionStatement } from "./types";

/** A SqlClient still missing the transaction member — what a test fake naturally provides. */
export type TransactionlessSqlClient = Omit<SqlClient, "executeTransaction">;

/** Completes a transactionless client with a sequential (non-atomic) batch runner, so every
 * statement still flows through the base's execute and its recording/simulation logic. */
export function withSequentialTransactions(base: TransactionlessSqlClient): SqlClient {
  return {
    select: (sql, params) => base.select(sql, params),
    execute: (sql, params) => base.execute(sql, params),
    async executeTransaction(statements: ReadonlyArray<SqlTransactionStatement>): Promise<void> {
      for (const statement of statements) {
        await base.execute(statement.sql, statement.params);
      }
    },
  };
}
