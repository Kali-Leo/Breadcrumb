/**
 * Purpose: the browser database's whole protocol — opening it, running SQL against it, handing
 * the file out for a backup and taking one back in — as plain functions.
 *
 * It sits beside the Worker rather than inside it so a test can drive it. The worker entry
 * (sqliteWorker.ts) is then a few lines of wiring, and the parts that could actually be wrong —
 * which requests get answered, what happens when OPFS is not there, whether a failed
 * transaction rolls back, whether a refused import leaves a usable connection — run in vitest
 * like ordinary code.
 * Main exports: WorkerRequest, WorkerReply, StorageBlocker, handleRequest.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { execRows, execRun, type SqliteHandle } from "./sqliteTypes";

/** The pool utility `installOpfsSAHPoolVfs` resolves with. The published typings declare
 * `exportFile` as async while the implementation returns the bytes directly; awaiting covers
 * both, so it is declared here the way it is used. */
interface SahPool {
  OpfsSAHPoolDb: new (filename: string) => ClosableHandle;
  exportFile(filename: string): Promise<Uint8Array> | Uint8Array;
  importDb(filename: string, bytes: Uint8Array): Promise<number>;
  reserveMinimumCapacity(count: number): Promise<number>;
}

/** The pool's databases can be closed; the shared handle type does not need to know that. */
type ClosableHandle = SqliteHandle & { close?(): void };

interface Sqlite3Loose {
  oo1: { DB: new (filename: string, flags: string) => SqliteHandle };
  installOpfsSAHPoolVfs?(options: { name: string }): Promise<SahPool>;
}

/**
 * Why this session is not writing to a file. The page turns each of these into a different
 * sentence, because the right next step differs: a browser that cannot do this at all, a
 * window that has been told to store nothing, and a second tab on a database another tab
 * already holds are three different situations and only one of them is fixed by switching
 * out of private browsing.
 */
export type StorageBlocker = "unsupported" | "blocked" | "otherTab" | "unknown";

export type WorkerRequest =
  | { id: number; kind: "open" }
  | { id: number; kind: "select"; sql: string; params: unknown[] }
  | { id: number; kind: "execute"; sql: string; params: unknown[] }
  | { id: number; kind: "transaction"; statements: { sql: string; params: unknown[] }[] }
  | { id: number; kind: "export" }
  | { id: number; kind: "import"; bytes: Uint8Array };

export type WorkerReply =
  | {
      id: number;
      ok: true;
      rows?: unknown[];
      persistent?: boolean;
      blocker?: StorageBlocker;
      bytes?: Uint8Array;
    }
  | { id: number; ok: false; error: string };

/** The pool keeps its own slot for each file; this is the name the app's database goes by. */
const DB_PATH = "/breadcrumb.db";
const POOL_NAME = "breadcrumb";
/** The pool's own default. Importing needs a free slot, and a pool that has been filled by
 * journal and temp files would otherwise refuse the import outright. */
const MINIMUM_POOL_SLOTS = 6;

let handle: ClosableHandle | null = null;
let pool: SahPool | null = null;
let persistent = false;
let blocker: StorageBlocker | null = null;

function run(sql: string, params: readonly unknown[] = []): void {
  if (handle !== null) execRun(handle, sql, params);
}

function rows<Row>(sql: string, params: readonly unknown[]): Row[] {
  return handle === null ? [] : execRows<Row>(handle, sql, params);
}

/** The same four things the pool VFS itself checks for before it will install. Asking first
 * means "this browser cannot" is told apart from "this browser would not", which is the whole
 * difference between the two sentences the page can show. */
function opfsSyncHandlesExist(): boolean {
  return (
    typeof FileSystemFileHandle !== "undefined" &&
    // Not `.createSyncAccessHandle` directly: the DOM typings this TypeScript ships with do
    // not know the method yet, and the point is to ask the runtime, not the compiler.
    "createSyncAccessHandle" in FileSystemFileHandle.prototype &&
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

/**
 * Turns the failure into the reason the page will show.
 *
 * The pool takes one exclusive sync access handle per file as it installs. A second tab on the
 * same origin asks for a handle the first tab is holding, and the file system answers
 * `NoModificationAllowedError` — so that name means "already open somewhere else", not a
 * broken browser. `SecurityError` and `NotAllowedError` are what a window that has been told
 * to store nothing answers with. Anything else stays honestly unnamed.
 */
function classifyStorageFailure(error: unknown): StorageBlocker {
  const name = error instanceof Error ? error.name : "";
  if (name === "NoModificationAllowedError") return "otherTab";
  if (name === "SecurityError" || name === "NotAllowedError") return "blocked";
  return "unknown";
}

async function open(): Promise<void> {
  if (handle !== null) return;
  const init = sqlite3InitModule as unknown as (options?: {
    print(): void;
    printErr(): void;
  }) => Promise<Sqlite3Loose>;
  const sqlite3 = await init({ print: () => {}, printErr: () => {} });

  if (sqlite3.installOpfsSAHPoolVfs === undefined || !opfsSyncHandlesExist()) {
    blocker = "unsupported";
  } else {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME });
      handle = new pool.OpfsSAHPoolDb(DB_PATH);
      persistent = true;
      blocker = null;
    } catch (error) {
      // Reported to the page with its cause, rather than losing a session quietly.
      pool = null;
      handle = null;
      blocker = classifyStorageFailure(error);
    }
  }
  if (handle === null) {
    handle = new sqlite3.oo1.DB(":memory:", "c");
    persistent = false;
  }
  // The schema relies on foreign keys, and SQLite defaults them off.
  run("PRAGMA foreign_keys = ON;");
}

/** Answers exactly one request. Every path returns a reply rather than throwing, so the caller
 * on the page always gets its promise settled. */
export async function handleRequest(request: WorkerRequest): Promise<WorkerReply> {
  try {
    switch (request.kind) {
      case "open":
        await open();
        if (blocker === null) return { id: request.id, ok: true, persistent };
        return { id: request.id, ok: true, persistent, blocker };
      case "select":
        return { id: request.id, ok: true, rows: rows(request.sql, request.params) };
      case "execute":
        run(request.sql, request.params);
        return { id: request.id, ok: true };
      case "transaction": {
        run("BEGIN;");
        try {
          for (const statement of request.statements) run(statement.sql, statement.params);
          run("COMMIT;");
        } catch (error) {
          run("ROLLBACK;");
          throw error;
        }
        return { id: request.id, ok: true };
      }
      case "export": {
        if (pool === null) throw new Error("this session has no database file to export");
        return { id: request.id, ok: true, bytes: await pool.exportFile(DB_PATH) };
      }
      case "import": {
        if (pool === null) throw new Error("this session has no database file to replace");
        const active = pool;
        // The pool writes straight into the slot, so the connection has to let go of it first.
        handle?.close?.();
        handle = null;
        try {
          await active.reserveMinimumCapacity(MINIMUM_POOL_SLOTS);
          // Refuses anything that is not an SQLite file before it writes a byte, so a rejected
          // import leaves the database that was already there untouched.
          await active.importDb(DB_PATH, request.bytes);
        } finally {
          // Taken or refused, this session needs a working connection back.
          handle = new active.OpfsSAHPoolDb(DB_PATH);
          run("PRAGMA foreign_keys = ON;");
        }
        return { id: request.id, ok: true };
      }
    }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
