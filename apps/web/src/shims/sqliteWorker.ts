/**
 * Purpose: owns the browser edition's SQLite database, inside a Worker.
 *
 * It has to be a Worker. Persisting to OPFS needs `createSyncAccessHandle`, which the standard
 * only exposes on worker threads — a main-thread database silently falls back to memory and
 * loses everything on refresh, which for a learning companion is the worst possible failure.
 * So the database lives here and the page talks to it by message.
 *
 * The protocol itself is in sqliteProtocol.ts so it can be tested without a Worker; this file
 * is only the wiring. Every message carries an id and gets exactly one reply, so the main
 * thread can keep a promise per call.
 * Main exports: none (worker entry).
 */
import { handleRequest, type WorkerRequest } from "./sqliteProtocol";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const reply = await handleRequest(event.data);
  // An exported database is the learner's whole history, megabytes of it. Handing the buffer
  // over rather than copying it keeps a backup from briefly costing twice its own size.
  if (reply.ok && reply.bytes !== undefined) {
    self.postMessage(reply, { transfer: [reply.bytes.buffer as ArrayBuffer] });
    return;
  }
  self.postMessage(reply);
};
