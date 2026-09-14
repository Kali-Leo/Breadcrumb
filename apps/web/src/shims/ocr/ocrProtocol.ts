/**
 * Purpose: the messages between the page and the OCR Worker. One request, exactly one reply
 * with the same id — the same shape the embedding and SQLite workers use, so the page keeps
 * one promise per call.
 * Main exports: OcrRequest, OcrReply, OcrLine.
 */

export interface OcrLine {
  text: string;
  /** Mean confidence of the characters read, 0 to 1. */
  score: number;
}

export interface OcrRequest {
  id: number;
  /** RGBA, row-major, as a canvas hands it back. Transferred, not copied. */
  rgba: Uint8Array;
  width: number;
  height: number;
  /** The app's network switch. The model download is the only request this feature ever
   * makes; an already-cached model loads with the switch off. */
  allowDownload: boolean;
}

export type OcrReply =
  | { id: number; ok: true; lines: OcrLine[]; msPerPage: number }
  | { id: number; ok: false; error: string };
