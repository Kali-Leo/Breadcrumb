/**
 * Purpose: one place for the type gymnastics @sqlite.org/sqlite-wasm needs, so the modules
 * that use it read like ordinary code.
 *
 * The published typings describe a narrower API than the library actually has — `exec` is
 * overloaded far more loosely at runtime than the declarations admit, and the OPFS pool
 * installer is spelled differently in the two. Keeping every cast here means there is exactly
 * one file to revisit when the typings improve, instead of casts scattered through the data
 * layer where they would look like carelessness.
 *
 * Main exports: SqliteHandle, execRows, execRun, openMemoryDatabase.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

/** The subset of the database object this app uses. */
export interface SqliteHandle {
  exec(sqlOrOptions: unknown): unknown;
}

/** SQLite binds numbers, strings, null and byte arrays. Booleans are the one thing the repos
 * can hand over that it will not take, so they become the integers the schema stores anyway. */
export function toBindable(params: readonly unknown[] = []): unknown[] {
  return params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    return value ?? null;
  });
}

/** Runs a query and returns its rows as objects. */
export function execRows<Row>(
  handle: SqliteHandle,
  sql: string,
  params: readonly unknown[] = [],
): Row[] {
  return handle.exec({
    sql,
    bind: toBindable(params),
    rowMode: "object",
    returnValue: "resultRows",
  }) as Row[];
}

/** Runs a statement for its effect. */
export function execRun(handle: SqliteHandle, sql: string, params: readonly unknown[] = []): void {
  handle.exec({ sql, bind: toBindable(params) });
}

interface Sqlite3Loose {
  oo1: { DB: new (filename: string, flags: string) => SqliteHandle };
}

async function loadSqlite(): Promise<Sqlite3Loose> {
  // The init options (silencing the library's console banner) are real but undeclared.
  const init = sqlite3InitModule as unknown as (options?: {
    print(): void;
    printErr(): void;
  }) => Promise<Sqlite3Loose>;
  return init({ print: () => {}, printErr: () => {} });
}

/** A database that lives only as long as the page. Used as the fallback, and by tests. */
export async function openMemoryDatabase(): Promise<SqliteHandle> {
  const sqlite3 = await loadSqlite();
  return new sqlite3.oo1.DB(":memory:", "c");
}
