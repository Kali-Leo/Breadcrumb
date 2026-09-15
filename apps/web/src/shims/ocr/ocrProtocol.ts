/**
 * Purpose: the messages between the page and the OCR Worker. One request, exactly one reply
 * with the same id — the same shape the embedding and SQLite workers use, so the page keeps
 * one promise per call. What comes back is the page as the desktop's Rust command returns
 * it (apps/desktop/src/lib/library/ocrPage.ts): lines with their boxes, and the blocks that
 * are not running text.
 * Main exports: OcrRequest, OcrReply, OcrPageResult (re-exported).
 */
import type { OcrPageResult } from "@desktop/lib/library/ocrPage";

export type { OcrBlock, OcrBox, OcrLine, OcrPageResult } from "@desktop/lib/library/ocrPage";

export interface OcrRequest {
  id: number;
  /** RGBA, row-major, as a canvas hands it back. Transferred, not copied. */
  rgba: Uint8Array;
  width: number;
  height: number;
  /** The app's network switch. The model downloads are the only requests this feature ever
   * makes; an already-cached model loads with the switch off. */
  allowDownload: boolean;
}

export type OcrReply =
  | { id: number; ok: true; page: OcrPageResult; msPerPage: number }
  | { id: number; ok: false; error: string };
