/**
 * Purpose: the browser's SQLite. The desktop build talks to a real database file through
 * tauri-plugin-sql; this compiles SQLite to WebAssembly and stores it in the browser's own
 * private filesystem (OPFS), so the same schema, the same migrations and the same hand-written
 * SQL all run unchanged — and the learner's data still never leaves their machine.
 *
 * The `opfs-sahpool` VFS is chosen deliberately over the plain `opfs` one: it does not need
 * cross-origin isolation (COOP/COEP), which means this can be served from any static host
 * rather than only from one that sets those headers. That matters for "open it and it works".
 *
 * Falls back to an in-memory database when OPFS is unavailable (private windows, older
 * browsers). Everything works, nothing persists, and the caller is told so it can say that
 * plainly rather than letting someone lose a day's work silently.
 *
 * Main exports: openBrowserDatabase, BrowserDatabase, isPersistent.
 */
import {
  execRows,
  execRun,
  openMemoryDatabase,
  openPooledDatabase,
  type SqliteHandle,
} from "./sqliteTypes";

export interface BrowserDatabase {
  select<Row>(sql: string, params: readonly unknown[]): Row[];
  execute(sql: string, params: readonly unknown[]): void;
  /** Runs a batch inside one transaction. Rolls back entirely if any statement throws. */
  transaction(statements: readonly { sql: string; params: readonly unknown[] }[]): void;
}

let database: BrowserDatabase | null = null;
let opening: Promise<BrowserDatabase> | null = null;
let persistent = false;

/** Whether the open database survives closing the tab. False means OPFS was unavailable and
 * this session is in memory only. */
export function isPersistent(): boolean {
  return persistent;
}

function wrap(handle: SqliteHandle): BrowserDatabase {
  // The schema relies on foreign keys, and SQLite defaults them off. The desktop side gets
  // this from sqlx; here it has to be asked for.
  execRun(handle, "PRAGMA foreign_keys = ON;");
  return {
    select: <Row>(sql: string, params: readonly unknown[]) => execRows<Row>(handle, sql, params),
    execute: (sql, params) => execRun(handle, sql, params),
    transaction(statements) {
      execRun(handle, "BEGIN;");
      try {
        for (const statement of statements) execRun(handle, statement.sql, statement.params);
        execRun(handle, "COMMIT;");
      } catch (error) {
        execRun(handle, "ROLLBACK;");
        throw error;
      }
    },
  };
}

/** Opens once and reuses. Concurrent callers share the same in-flight open rather than each
 * installing their own VFS pool. */
export async function openBrowserDatabase(): Promise<BrowserDatabase> {
  if (database !== null) return database;
  opening ??= (async () => {
    const pooled = await openPooledDatabase("/breadcrumb.db");
    persistent = pooled !== null;
    database = wrap(pooled ?? (await openMemoryDatabase()));
    return database;
  })();
  return opening;
}
