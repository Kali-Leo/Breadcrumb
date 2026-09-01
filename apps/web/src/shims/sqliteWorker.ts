/**
 * Purpose: owns the browser edition's SQLite database, inside a Worker.
 *
 * It has to be a Worker. Persisting to OPFS needs `createSyncAccessHandle`, which the
 * standard only exposes on worker threads — a main-thread database silently falls back to
 * memory and loses everything on refresh, which for a learning companion is the worst
 * possible failure. So the database lives here and the page talks to it by message.
 *
 * The protocol is deliberately tiny: open, select, execute, transaction. Every message
 * carries an id and gets exactly one reply, so the main thread can keep a promise per call.
 * Main exports: none (worker entry).
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

interface SqliteHandle {
  exec(options: unknown): unknown;
}

interface Sqlite3Loose {
  oo1: { DB: new (filename: string, flags: string) => SqliteHandle };
  installOpfsSAHPoolVfs?(options: { name: string }): Promise<{
    OpfsSAHPoolDb: new (filename: string) => SqliteHandle;
  }>;
}

export type WorkerRequest =
  | { id: number; kind: "open" }
  | { id: number; kind: "select"; sql: string; params: unknown[] }
  | { id: number; kind: "execute"; sql: string; params: unknown[] }
  | { id: number; kind: "transaction"; statements: { sql: string; params: unknown[] }[] };

export type WorkerReply =
  | { id: number; ok: true; rows?: unknown[]; persistent?: boolean }
  | { id: number; ok: false; error: string };

let handle: SqliteHandle | null = null;
let persistent = false;

/** SQLite binds numbers, strings, null and byte arrays. Booleans are the one thing the repos
 * hand over that it will not take, so they become the integers the schema stores anyway. */
function toBindable(params: readonly unknown[]): unknown[] {
  return params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    return value ?? null;
  });
}

function run(sql: string, params: readonly unknown[]): void {
  handle?.exec({ sql, bind: toBindable(params) });
}

function rows<Row>(sql: string, params: readonly unknown[]): Row[] {
  return (handle?.exec({
    sql,
    bind: toBindable(params),
    rowMode: "object",
    returnValue: "resultRows",
  }) ?? []) as Row[];
}

async function open(): Promise<void> {
  if (handle !== null) return;
  const init = sqlite3InitModule as unknown as (options?: {
    print(): void;
    printErr(): void;
  }) => Promise<Sqlite3Loose>;
  const sqlite3 = await init({ print: () => {}, printErr: () => {} });

  if (sqlite3.installOpfsSAHPoolVfs !== undefined) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "breadcrumb" });
      handle = new pool.OpfsSAHPoolDb("/breadcrumb.db");
      persistent = true;
    } catch {
      // Storage blocked, a private window, or no OPFS: fall through to memory. Reported to
      // the page so it can say so rather than losing a session quietly.
      handle = null;
    }
  }
  if (handle === null) {
    handle = new sqlite3.oo1.DB(":memory:", "c");
    persistent = false;
  }
  // The schema relies on foreign keys, and SQLite defaults them off.
  run("PRAGMA foreign_keys = ON;", []);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const reply = (message: WorkerReply) => self.postMessage(message);
  try {
    switch (request.kind) {
      case "open":
        await open();
        reply({ id: request.id, ok: true, persistent });
        break;
      case "select":
        reply({ id: request.id, ok: true, rows: rows(request.sql, request.params) });
        break;
      case "execute":
        run(request.sql, request.params);
        reply({ id: request.id, ok: true });
        break;
      case "transaction": {
        run("BEGIN;", []);
        try {
          for (const statement of request.statements) run(statement.sql, statement.params);
          run("COMMIT;", []);
        } catch (error) {
          run("ROLLBACK;", []);
          throw error;
        }
        reply({ id: request.id, ok: true });
        break;
      }
    }
  } catch (error) {
    reply({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
