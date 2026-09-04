/**
 * Purpose: the browser database's whole protocol — opening it, running SQL against it, handing
 * the file out for a backup and taking one back in — as plain functions.
 *
 * It sits beside the Worker rather than inside it so a test can drive it. The worker entry
 * (sqliteWorker.ts) is then a few lines of wiring, and the parts that could actually be wrong —
 * which requests get answered, what happens when OPFS is not there, whether a failed
 * transaction rolls back, whether a refused import leaves a usable connection — run in vitest
 * like ordinary code. The connection itself lives in sqliteConnection.ts.
 * Main exports: WorkerRequest, WorkerReply, StorageBlocker, handleRequest.
 */
import {
  exportFile,
  openConnection,
  replaceFile,
  rows,
  run,
  type StorageBlocker,
  sessionState,
} from "./sqliteConnection";

export type { StorageBlocker } from "./sqliteConnection";

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

/** Answers exactly one request, assuming it has the database to itself. */
async function answer(request: WorkerRequest): Promise<WorkerReply> {
  try {
    switch (request.kind) {
      case "open": {
        await openConnection();
        const { persistent, blocker } = sessionState();
        if (blocker === null) return { id: request.id, ok: true, persistent };
        return { id: request.id, ok: true, persistent, blocker };
      }
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
      case "export":
        return { id: request.id, ok: true, bytes: await exportFile() };
      case "import":
        await replaceFile(request.bytes);
        return { id: request.id, ok: true };
    }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One request at a time, in the order they arrived. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Answers exactly one request. Every path returns a reply rather than throwing, so the caller
 * on the page always gets its promise settled.
 *
 * Requests are serialized rather than interleaved because `import` closes the connection while
 * the pool writes the backup over the file, and the app keeps asking throughout — timers, the
 * cross-midnight poll, the embedding backfill. Queueing behind the import is chosen over
 * refusing those requests: refusing would surface an error the learner did nothing to cause,
 * whereas waiting a second for an import they started themselves is invisible and correct.
 * Everything else here is short, so the queue costs nothing the rest of the time; the one
 * exception is `export`, which reads a large file and now makes the app wait — the alternative
 * being the reads it would otherwise answer from a database that is not open.
 */
export function handleRequest(request: WorkerRequest): Promise<WorkerReply> {
  const answered = queue.then(() => answer(request));
  // `answer` settles rather than throwing, but a rejection here would poison every later
  // request in the chain, so the tail the next request waits on can never be a rejected one.
  queue = answered.then(
    () => undefined,
    () => undefined,
  );
  return answered;
}
