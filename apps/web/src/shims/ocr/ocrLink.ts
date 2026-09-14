/**
 * Purpose: the page's end of the OCR Worker — spawn it on first use, pair each request with
 * its reply by id, and let a worker that dies take only the requests in flight with it.
 *
 * A separate Worker from the embedding one, deliberately: the two share the onnxruntime
 * binary (one download, one HTTP cache entry) but not a thread, so a book's vector pass
 * running in the background does not queue behind every page of a scan being read, or the
 * other way round.
 * Main exports: OcrLink, createOcrLink.
 */
import type { OcrLine, OcrReply, OcrRequest } from "./ocrProtocol";

export interface OcrLink {
  recognize(
    rgba: Uint8Array,
    width: number,
    height: number,
    allowDownload: boolean,
  ): Promise<OcrLine[]>;
}

type Settle = (reply: OcrReply | Error) => void;

export function createOcrLink(spawn: () => Worker): OcrLink {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Settle>();

  function failAll(error: Error): void {
    const waiting = [...pending.values()];
    pending.clear();
    worker?.terminate();
    worker = null;
    for (const settle of waiting) settle(error);
  }

  function ensureWorker(): Worker {
    if (worker !== null) return worker;
    const spawned = spawn();
    spawned.onmessage = (event: MessageEvent<OcrReply>) => {
      const settle = pending.get(event.data.id);
      pending.delete(event.data.id);
      settle?.(event.data);
    };
    spawned.onerror = (event: ErrorEvent) => {
      failAll(new Error(event.message || "recognition worker failed"));
    };
    spawned.onmessageerror = () => {
      failAll(new Error("recognition worker sent an unreadable message"));
    };
    worker = spawned;
    return spawned;
  }

  return {
    recognize(rgba, width, height, allowDownload) {
      const target = ensureWorker();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, (reply) => {
          if (reply instanceof Error) reject(reply);
          else if (reply.ok) resolve(reply.lines);
          else reject(new Error(reply.error));
        });
        const request: OcrRequest = { id, rgba, width, height, allowDownload };
        // The pixels move rather than copy: fifteen megabytes a page, and the caller has no
        // further use for them.
        target.postMessage(request, [rgba.buffer]);
      });
    },
  };
}
