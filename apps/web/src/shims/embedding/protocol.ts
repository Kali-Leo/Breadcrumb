/**
 * Purpose: the messages between the page and the embedding Worker. One request, exactly one
 * reply with the same id, so the page can keep a promise per call — the same shape the
 * SQLite worker uses.
 *
 * A successful reply also carries how the work was done and how long a passage took. Neither
 * is diagnostics for its own sake: the measured cost per passage is the only honest basis for
 * telling a reader that another browser would finish their book in minutes rather than in an
 * hour, and it is a measurement, not a guess from the user agent string.
 * Main exports: EmbedRequest, EmbedReply, BackendId.
 */

export type BackendId = "webgpu" | "wasm-threads" | "wasm-single";

export interface EmbedRequest {
  id: number;
  texts: string[];
  /** The app's network switch. The model download is the only network request this feature
   * ever makes; an already-cached model loads with the switch off. */
  allowDownload: boolean;
}

export type EmbedReply =
  | {
      id: number;
      ok: true;
      vectors: number[][];
      loaded: true;
      backend: BackendId;
      /** Wall-clock milliseconds per passage for this call, model loading excluded. */
      msPerText: number;
    }
  | { id: number; ok: false; error: string; loaded: boolean };
