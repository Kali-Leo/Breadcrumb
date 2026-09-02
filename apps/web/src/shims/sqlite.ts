/**
 * Purpose: the browser's SQLite, as seen by the page. The database itself lives in a Worker
 * (sqliteWorker.ts) because persisting to OPFS requires sync access handles, which the
 * standard only gives worker threads; this module is the promise-shaped remote control.
 *
 * The same schema, the same migrations and the same hand-written SQL as the desktop build run
 * against it unchanged, and the learner's data still never leaves their machine — it goes into
 * the browser's own private, per-site storage.
 *
 * When OPFS is unavailable the worker opens an in-memory database instead. Everything works and
 * nothing persists, so the reason comes back with the reply and the page says which of the
 * three situations it is rather than losing a session quietly.
 *
 * Main exports: openBrowserDatabase, BrowserDatabase, storageBlocker,
 * requestPersistentStorage, exportDatabaseFile, importDatabaseFile.
 */
import type { StorageBlocker, WorkerReply, WorkerRequest } from "./sqliteProtocol";

/** Omit distributes over a union only when written conditionally; without this, the request
 * type collapses to the properties every member shares (just `kind`). */
type WithoutId<T> = T extends { id: number } ? Omit<T, "id"> : never;

type Link = { send(request: WithoutId<WorkerRequest>): Promise<WorkerReply & { ok: true }> };

export interface BrowserDatabase {
  select<Row>(sql: string, params: readonly unknown[]): Promise<Row[]>;
  execute(sql: string, params: readonly unknown[]): Promise<void>;
  /** Runs a batch inside one transaction. Rolls back entirely if any statement throws. */
  transaction(statements: readonly { sql: string; params: readonly unknown[] }[]): Promise<void>;
}

let opening: Promise<BrowserDatabase> | null = null;
let link: Link | null = null;
let blocker: StorageBlocker | null = null;

/** Why this session is in memory rather than on disk, or null when it is on disk — which is
 * also the answer to whether anything done here survives closing the tab. */
export function storageBlocker(): StorageBlocker | null {
  return blocker;
}

/**
 * Asks the browser to keep this origin's storage instead of evicting it when the disk gets
 * tight. Without it the database is best-effort: it survives closing the tab, and then one day
 * it does not, with no warning — the quietest way this edition could lose someone's work.
 *
 * A refusal is not worth a banner. It does not mean this session will be lost; it means the
 * browser reserves the right to reclaim the space later, which is a fact for the README rather
 * than a sentence to greet someone with. Chrome decides silently, Firefox asks, Safari grants
 * it to sites added to the home screen.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage: StorageManager | undefined = navigator.storage;
    return storage === undefined ? false : await storage.persist();
  } catch {
    return false;
  }
}

function connect(): Link {
  const worker = new Worker(new URL("./sqliteWorker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (reply: WorkerReply) => void>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const settle = pending.get(event.data.id);
    pending.delete(event.data.id);
    settle?.(event.data);
  };

  return {
    send(request) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, (reply) => {
          if (reply.ok) resolve(reply);
          else reject(new Error(reply.error));
        });
        worker.postMessage({ ...request, id } as WorkerRequest);
      });
    },
  };
}

/** Opens once and reuses; concurrent callers share the same in-flight open. */
export async function openBrowserDatabase(): Promise<BrowserDatabase> {
  opening ??= (async () => {
    const active = connect();
    link = active;
    blocker = (await active.send({ kind: "open" })).blocker ?? null;
    return {
      async select<Row>(sql: string, params: readonly unknown[]): Promise<Row[]> {
        const reply = await active.send({ kind: "select", sql, params: [...params] });
        return (reply.rows ?? []) as Row[];
      },
      async execute(sql, params) {
        await active.send({ kind: "execute", sql, params: [...params] });
      },
      async transaction(statements) {
        await active.send({
          kind: "transaction",
          statements: statements.map((statement) => ({
            sql: statement.sql,
            params: [...statement.params],
          })),
        });
      },
    };
  })();
  return opening;
}

async function activeLink(): Promise<Link> {
  await openBrowserDatabase();
  if (link === null) throw new Error("the database is not open");
  return link;
}

/** The whole database file, as the learner would save it. Rejects for an in-memory session,
 * which has no file behind it. */
export async function exportDatabaseFile(): Promise<Uint8Array> {
  const reply = await (await activeLink()).send({ kind: "export" });
  if (reply.bytes === undefined) throw new Error("the database returned no file");
  return reply.bytes;
}

/** Replaces the database with the given file. The worker refuses anything that is not an
 * SQLite database before it writes a byte, so a wrong file leaves this one as it was. */
export async function importDatabaseFile(bytes: Uint8Array): Promise<void> {
  await (await activeLink()).send({ kind: "import", bytes });
}
