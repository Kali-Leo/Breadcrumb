/**
 * Purpose: wraps better-sqlite3 into the @breadcrumb/core-db SqlClient contract, and provides
 * createTempDatabase() — a unique temp-file SQLite database, fully migrated via the REAL
 * runMigrations, with its repos ready to use. Each simulated session gets its own.
 * Main exports: createSqliteClient, createTempDatabase, TempDatabase.
 */
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations, type SqlClient, type SqlTransactionStatement } from "@breadcrumb/core-db";
import Database from "better-sqlite3";
import { createSimlabRepos, type SimlabRepos } from "./repos";

/** Adapts a better-sqlite3 handle to SqlClient. execute() falls back to db.exec() for
 * parameter-less statements containing no '?' (DDL, multi-statement migrations) since
 * better-sqlite3's prepared statements reject those; every other call goes through a
 * prepared statement, same as the real app's tauri-plugin-sql adapter.
 * executeTransaction() is genuinely atomic via better-sqlite3's transaction(): any
 * statement error rolls the whole batch back, matching the desktop's Rust command. */
export function createSqliteClient(db: Database.Database): SqlClient {
  const runStatement = (statement: SqlTransactionStatement): void => {
    const params = statement.params;
    if ((params === undefined || params.length === 0) && !statement.sql.includes("?")) {
      db.exec(statement.sql);
      return;
    }
    db.prepare(statement.sql).run(...(params ?? []));
  };
  const runBatchInTransaction = db.transaction(
    (statements: ReadonlyArray<SqlTransactionStatement>) => {
      for (const statement of statements) runStatement(statement);
    },
  );
  return {
    async select<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]> {
      return db.prepare(sql).all(...(params ?? [])) as Row[];
    },
    async execute(sql: string, params?: readonly unknown[]): Promise<void> {
      runStatement({ sql, params });
    },
    async executeTransaction(statements: ReadonlyArray<SqlTransactionStatement>): Promise<void> {
      runBatchInTransaction(statements);
    },
  };
}

export interface TempDatabase {
  sql: SqlClient;
  repos: SimlabRepos;
  path: string;
  close(): void;
}

/** Opens a fresh temp-file SQLite database, runs every migration, and returns it ready for
 * use. Callers must call close() when done — the file is deleted then. */
export async function createTempDatabase(): Promise<TempDatabase> {
  const path = join(tmpdir(), `breadcrumb-simlab-${randomUUID()}.sqlite`);
  const db = new Database(path);
  const sql = createSqliteClient(db);
  await runMigrations(sql);
  return {
    sql,
    repos: createSimlabRepos(sql),
    path,
    close() {
      db.close();
      if (existsSync(path)) unlinkSync(path);
    },
  };
}
