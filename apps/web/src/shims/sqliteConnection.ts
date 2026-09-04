/**
 * Purpose: the one connection this session has to the browser's database — opening it, running
 * SQL through it, and putting it back after a backup has been written over the file.
 *
 * It is split out of sqliteProtocol.ts because the two answer different questions. That file
 * decides which request gets which reply; this one owns the fact that a connection can be
 * absent, which is the fact that used to be lost. `run` and `rows` throw when there is no
 * connection rather than doing nothing and returning no rows: a query answered from a closed
 * database reads as "that row does not exist", and a write answered from one is discarded while
 * reporting success — the quietest way this edition could destroy someone's work.
 *
 * Main exports: StorageBlocker, openConnection, run, rows, sessionState, exportFile,
 * replaceFile.
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

/** Throws rather than silently doing nothing: see the file header. */
export function run(sql: string, params: readonly unknown[] = []): void {
  if (handle === null) throw new Error("the database is not open");
  execRun(handle, sql, params);
}

/** Throws rather than silently answering with no rows: see the file header. */
export function rows<Row>(sql: string, params: readonly unknown[]): Row[] {
  if (handle === null) throw new Error("the database is not open");
  return execRows<Row>(handle, sql, params);
}

/** What the page needs to know about this session: whether it is on disk, and if not, why. */
export function sessionState(): { persistent: boolean; blocker: StorageBlocker | null } {
  return { persistent, blocker };
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

/** Opens the database, on disk if this browser will allow it and in memory otherwise, and
 * leaves `sessionState()` able to say which of the two happened and why. */
export async function openConnection(): Promise<void> {
  if (handle !== null) return;
  // The init options (silencing the library's console banner) are real but undeclared.
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

/** The whole database file. Throws for an in-memory session, which has no file behind it. */
export async function exportFile(): Promise<Uint8Array> {
  if (pool === null) throw new Error("this session has no database file to export");
  return await pool.exportFile(DB_PATH);
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Writes a backup over this session's database file and comes back on the other side of it.
 *
 * The connection has to let go of the slot while the pool writes into it, so for the length of
 * this call there is no database. Nothing else may run in that window — sqliteProtocol.ts
 * serializes requests so nothing does — and the caller has to hear about it if the connection
 * does not come back, because from then on this session has nothing to read or write at all.
 * That is why the reopen is not a bare `finally`: a `finally` that throws replaces the import's
 * own reason with a second one, and the learner needs the first to know whether their file was
 * the problem. Both failures travel out together instead.
 */
export async function replaceFile(bytes: Uint8Array): Promise<void> {
  if (pool === null) throw new Error("this session has no database file to replace");
  const active = pool;
  handle?.close?.();
  handle = null;

  let importFailure: unknown = null;
  try {
    await active.reserveMinimumCapacity(MINIMUM_POOL_SLOTS);
    // Refuses anything that is not an SQLite file before it writes a byte, so a rejected
    // import leaves the database that was already there untouched.
    await active.importDb(DB_PATH, bytes);
  } catch (error) {
    importFailure = error;
  }

  try {
    // Taken or refused, this session needs a working connection back.
    handle = new active.OpfsSAHPoolDb(DB_PATH);
    run("PRAGMA foreign_keys = ON;");
  } catch (error) {
    const failed = `the database could not be reopened: ${reason(error)}`;
    throw new Error(importFailure === null ? failed : `${reason(importFailure)} — and ${failed}`);
  }
  if (importFailure !== null) throw importFailure;
}
