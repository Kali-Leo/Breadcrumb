/**
 * Purpose: the messages between the page and the embedding Worker. One request, exactly one
 * reply with the same id, so the page can keep a promise per call — the same shape the
 * SQLite worker uses.
 * Main exports: EmbedRequest, EmbedReply.
 */

export interface EmbedRequest {
  id: number;
  texts: string[];
  /** The app's network switch. The model download is the only network request this feature
   * ever makes; an already-cached model loads with the switch off. */
  allowDownload: boolean;
}

export type EmbedReply =
  | { id: number; ok: true; vectors: number[][]; loaded: true }
  | { id: number; ok: false; error: string; loaded: boolean };
