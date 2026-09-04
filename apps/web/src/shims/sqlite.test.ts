/**
 * Purpose: the page's end of the SQLite worker, driven with a fake Worker. Both guarantees
 * here are about the worker going away rather than answering, which is the one failure the
 * page cannot recover from on its own: the first screen waits on this module before it renders
 * anything, so a promise that never settles is an application that never appears.
 *
 * The worker itself is covered by sqliteProtocol.test.ts; nothing real is loaded here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerReply, WorkerRequest } from "./sqliteProtocol";

const spawned: FakeWorker[] = [];

class FakeWorker {
  sent: WorkerRequest[] = [];
  terminated = false;
  /** Replies on its own to whatever it is sent; turned off to hold a request in flight. */
  answers = true;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  constructor() {
    spawned.push(this);
  }

  postMessage(request: WorkerRequest): void {
    this.sent.push(request);
    if (!this.answers) return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: request.id, ok: true, persistent: true },
      } as MessageEvent<WorkerReply>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

/** Replies `ok: false` to everything, the shape a wasm load failure takes. */
class RefusingWorker extends FakeWorker {
  override postMessage(request: WorkerRequest): void {
    this.sent.push(request);
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: request.id, ok: false, error: "wasm failed to load" },
      } as MessageEvent<WorkerReply>);
    });
  }
}

function useWorker(implementation: new () => FakeWorker): void {
  Object.defineProperty(globalThis, "Worker", { value: implementation, configurable: true });
}

beforeEach(() => {
  // The module holds the open database in module state, so each test needs a fresh copy.
  vi.resetModules();
  spawned.length = 0;
  useWorker(FakeWorker);
});

describe("the page's end of the SQLite worker", () => {
  it("rejects every in-flight request when the worker dies, rather than leaving the page waiting forever", async () => {
    const sqlite = await import("./sqlite");
    await sqlite.openBrowserDatabase();
    const worker = spawned[0] as FakeWorker;
    // Nothing else can notice: a Worker that fails reports it here and nowhere else.
    expect(typeof worker.onerror).toBe("function");
    expect(typeof worker.onmessageerror).toBe("function");

    worker.answers = false;
    const exporting = sqlite.exportDatabaseFile();
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.crash("out of memory");

    await expect(exporting).rejects.toThrow("out of memory");
  });

  it("refuses a request made after the worker died instead of posting it to a worker that is gone", async () => {
    const sqlite = await import("./sqlite");
    await sqlite.openBrowserDatabase();
    const worker = spawned[0] as FakeWorker;
    worker.crash("out of memory");

    await expect(sqlite.exportDatabaseFile()).rejects.toThrow("out of memory");
    expect(worker.sent.some((request) => request.kind === "export")).toBe(false);
  });

  it("opens with a fresh worker after a failed open, rather than holding the whole session to one bad attempt", async () => {
    useWorker(RefusingWorker);
    const sqlite = await import("./sqlite");
    await expect(sqlite.openBrowserDatabase()).rejects.toThrow("wasm failed to load");

    // Whatever it was — a half-deployed script, a worker the browser reclaimed — it is over.
    useWorker(FakeWorker);
    await expect(sqlite.openBrowserDatabase()).resolves.toBeDefined();
    expect(spawned).toHaveLength(2);
  });
});
