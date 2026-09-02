/**
 * Purpose: the page's end of the embedding Worker — spawn it on first use, pair each request
 * with its reply by id, and tell the truth about whether the model is loaded.
 *
 * A Worker that dies (a script that failed to load, an out-of-memory crash while building
 * the session) takes every in-flight request with it. Those reject, the link forgets the
 * worker, and the next call spawns a fresh one — so a transient failure costs one round of
 * degraded results, not the rest of the session.
 * Main exports: EmbeddingLink, createEmbeddingLink.
 */
import type { EmbedReply, EmbedRequest } from "./protocol";

export interface EmbeddingLink {
  /** Whether the worker has a model in memory right now, as last reported by it. */
  readonly loaded: boolean;
  embed(texts: readonly string[], allowDownload: boolean): Promise<number[][]>;
}

type Settle = (reply: EmbedReply | Error) => void;

export function createEmbeddingLink(spawn: () => Worker): EmbeddingLink {
  let worker: Worker | null = null;
  let loaded = false;
  let nextId = 1;
  const pending = new Map<number, Settle>();

  function failAll(error: Error): void {
    const waiting = [...pending.values()];
    pending.clear();
    worker?.terminate();
    worker = null;
    loaded = false;
    for (const settle of waiting) settle(error);
  }

  function ensureWorker(): Worker {
    if (worker !== null) return worker;
    const spawned = spawn();
    spawned.onmessage = (event: MessageEvent<EmbedReply>) => {
      loaded = event.data.loaded;
      const settle = pending.get(event.data.id);
      pending.delete(event.data.id);
      settle?.(event.data);
    };
    spawned.onerror = (event: ErrorEvent) => {
      failAll(new Error(event.message || "embedding worker failed"));
    };
    spawned.onmessageerror = () => {
      failAll(new Error("embedding worker sent an unreadable message"));
    };
    worker = spawned;
    return spawned;
  }

  return {
    get loaded() {
      return loaded;
    },
    embed(texts, allowDownload) {
      const target = ensureWorker();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, (reply) => {
          if (reply instanceof Error) reject(reply);
          else if (reply.ok) resolve(reply.vectors);
          else reject(new Error(reply.error));
        });
        const request: EmbedRequest = { id, texts: [...texts], allowDownload };
        target.postMessage(request);
      });
    },
  };
}
