/**
 * Purpose: the browser's SQLite, as seen by the page. The database itself lives in a Worker
 * (sqliteWorker.ts) because persisting to OPFS requires sync access handles, which the
 * standard only gives worker threads; this module is the promise-shaped remote control.
 *
 * The same schema, the same migrations and the same hand-written SQL as the desktop build run
 * against it unchanged, and the learner's data still never leaves their machine — it goes into
 * the browser's own private, per-site storage.
 *
 * When OPFS is unavailable (a private window, storage blocked) the worker opens an in-memory
 * database instead. Everything works and nothing persists, so `isPersistent()` reports it and
 * the page says so out loud rather than losing a session quietly.
 *
 * Main exports: openBrowserDatabase, BrowserDatabase, isPersistent.
 */
import type { WorkerReply, WorkerRequest } from "./sqliteWorker";

/** Omit distributes over a union only when written conditionally; without this, the request
 * type collapses to the properties every member shares (just `kind`). */
type WithoutId<T> = T extends { id: number } ? Omit<T, "id"> : never;

export interface BrowserDatabase {
  select<Row>(sql: string, params: readonly unknown[]): Promise<Row[]>;
  execute(sql: string, params: readonly unknown[]): Promise<void>;
  /** Runs a batch inside one transaction. Rolls back entirely if any statement throws. */
  transaction(statements: readonly { sql: string; params: readonly unknown[] }[]): Promise<void>;
}

let opening: Promise<BrowserDatabase> | null = null;
let persistent = false;

/** Whether the open database survives closing the tab. False means OPFS was unavailable and
 * this session is in memory only. */
export function isPersistent(): boolean {
  return persistent;
}

function connect(): {
  send(request: WithoutId<WorkerRequest>): Promise<WorkerReply & { ok: true }>;
} {
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
    const link = connect();
    const opened = await link.send({ kind: "open" });
    persistent = opened.persistent === true;
    return {
      async select<Row>(sql: string, params: readonly unknown[]): Promise<Row[]> {
        const reply = await link.send({ kind: "select", sql, params: [...params] });
        return (reply.rows ?? []) as Row[];
      },
      async execute(sql, params) {
        await link.send({ kind: "execute", sql, params: [...params] });
      },
      async transaction(statements) {
        await link.send({
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
