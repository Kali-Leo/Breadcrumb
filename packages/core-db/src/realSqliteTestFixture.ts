/**
 * Purpose: shared fixture for the real-database tests — adapts node:sqlite to SqlClient (so
 * the package needs no extra dependency) and opens in-memory databases migrated either all
 * the way or only up to a chosen migration. Test-only; not exported from the package entry.
 * Main exports: createNodeSqliteClient, openMigratedDatabase, openDatabaseMigratedThrough.
 */
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, runMigrations } from "./migrations";
import type { SqlClient, SqlTransactionStatement } from "./types";

export interface RealSqliteDatabase {
  sql: SqlClient;
  close(): void;
}

/** Parameter-less statements with no '?' go through exec() (DDL and the multi-statement
 * migrations), everything else through a prepared statement. executeTransaction is a real
 * BEGIN/COMMIT, so a failing batch rolls back exactly like the desktop's Rust command. */
export function createNodeSqliteClient(db: DatabaseSync): SqlClient {
  const runStatement = (statement: SqlTransactionStatement): void => {
    const params = statement.params;
    if ((params === undefined || params.length === 0) && !statement.sql.includes("?")) {
      db.exec(statement.sql);
      return;
    }
    db.prepare(statement.sql).run(...(params as readonly never[]));
  };
  return {
    async select<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]> {
      return db.prepare(sql).all(...((params ?? []) as readonly never[])) as Row[];
    },
    async execute(sql: string, params?: readonly unknown[]): Promise<void> {
      runStatement({ sql, params });
    },
    async executeTransaction(statements: ReadonlyArray<SqlTransactionStatement>): Promise<void> {
      db.exec("BEGIN");
      try {
        for (const statement of statements) runStatement(statement);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function openDatabase(): { db: DatabaseSync; sql: SqlClient } {
  const db = new DatabaseSync(":memory:");
  return { db, sql: createNodeSqliteClient(db) };
}

/** A fresh in-memory database with every migration applied, through the real runMigrations. */
export async function openMigratedDatabase(): Promise<RealSqliteDatabase> {
  const { db, sql } = openDatabase();
  await runMigrations(sql);
  return { sql, close: () => db.close() };
}

/** A database frozen at an older app version: the migration list is replayed exactly the way
 * runMigrations does, but only up to and including `lastId`. */
export async function openDatabaseMigratedThrough(lastId: string): Promise<RealSqliteDatabase> {
  const { db, sql } = openDatabase();
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const migration of MIGRATIONS) {
    await sql.executeTransaction([
      ...migration.statements.map((statement) => ({ sql: statement })),
      {
        sql: "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        params: [migration.id, "2026-08-16T00:00:00.000Z"],
      },
    ]);
    if (migration.id === lastId) return { sql, close: () => db.close() };
  }
  db.close();
  throw new Error(`unknown migration id: ${lastId}`);
}
