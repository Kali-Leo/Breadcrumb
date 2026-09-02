/**
 * Purpose: the page's side of the embedding worker, driven with a fake Worker — ids pair
 * requests with replies, the network switch travels with every request, failures reject
 * rather than resolve empty, and `loaded` says what the worker last said.
 */
import { describe, expect, it } from "vitest";
import type { EmbedReply, EmbedRequest } from "./embedding/protocol";
import { createEmbeddingLink } from "./embedding/workerLink";

class FakeWorker {
  static spawned: FakeWorker[] = [];
  requests: EmbedRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<EmbedReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  constructor() {
    FakeWorker.spawned.push(this);
  }

  postMessage(request: EmbedRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(reply: EmbedReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<EmbedReply>);
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function makeLink() {
  FakeWorker.spawned = [];
  const link = createEmbeddingLink(() => new FakeWorker() as unknown as Worker);
  return { link, worker: () => FakeWorker.spawned[0] as FakeWorker };
}

describe("createEmbeddingLink", () => {
  it("spawns nothing until the first call, then reuses the worker", async () => {
    const { link, worker } = makeLink();
    expect(FakeWorker.spawned).toHaveLength(0);
    expect(link.loaded).toBe(false);

    const first = link.embed(["a"], true);
    const second = link.embed(["b", "c"], false);
    expect(FakeWorker.spawned).toHaveLength(1);
    expect(worker().requests).toEqual([
      { id: 1, texts: ["a"], allowDownload: true },
      { id: 2, texts: ["b", "c"], allowDownload: false },
    ]);

    // Out of order on purpose: the id, not arrival, decides who gets what.
    worker().reply({ id: 2, ok: true, vectors: [[0.2], [0.3]], loaded: true });
    worker().reply({ id: 1, ok: true, vectors: [[0.1]], loaded: true });
    await expect(first).resolves.toEqual([[0.1]]);
    await expect(second).resolves.toEqual([[0.2], [0.3]]);
    expect(link.loaded).toBe(true);
  });

  it("rejects a failed request with the worker's reason and reports loaded honestly", async () => {
    const { link, worker } = makeLink();
    const call = link.embed(["a"], false);
    worker().reply({ id: 1, ok: false, error: "network switch is off", loaded: false });
    await expect(call).rejects.toThrow("network switch is off");
    expect(link.loaded).toBe(false);
    expect(worker().terminated).toBe(false);
  });

  it("fails every in-flight call when the worker dies, and spawns afresh next time", async () => {
    const { link, worker } = makeLink();
    const one = link.embed(["a"], true);
    const two = link.embed(["b"], true);
    worker().reply({ id: 1, ok: true, vectors: [[1]], loaded: true });
    await one;
    expect(link.loaded).toBe(true);

    worker().crash("out of memory");
    await expect(two).rejects.toThrow("out of memory");
    expect(worker().terminated).toBe(true);
    expect(link.loaded).toBe(false);

    const three = link.embed(["c"], true);
    expect(FakeWorker.spawned).toHaveLength(2);
    const fresh = FakeWorker.spawned[1] as FakeWorker;
    expect(fresh.requests[0]?.id).toBe(3);
    fresh.reply({ id: 3, ok: true, vectors: [[3]], loaded: true });
    await expect(three).resolves.toEqual([[3]]);
  });
});
