/**
 * Purpose: what the browser edition answers when the app asks for a page to be read — the
 * same PP-OCRv6 family the desktop runs through Rust, the tiny pair, in a Web Worker
 * (ocr/ocrWorker.ts). This module is the page's end of that worker; the desktop bridge
 * (apps/desktop/src/lib/platform/ocr.ts) reaches it through the aliased `invoke("ocr_page")`
 * and never knows the difference.
 *
 * The download is 6.3 MB, fetched once on first use (network switch permitting) into the
 * Cache API and loaded from there ever after. Every failure surfaces as a rejection that
 * lands on the same degradation paths a failed native call takes.
 * Main exports: recognizePageInBrowser.
 */
import { createOcrLink, type OcrLink } from "./ocr/ocrLink";
import type { OcrLine } from "./ocr/ocrProtocol";

let link: OcrLink | null = null;

export async function recognizePageInBrowser(
  rgba: Uint8Array,
  width: number,
  height: number,
  allowDownload: boolean,
): Promise<OcrLine[]> {
  link ??= createOcrLink(
    () => new Worker(new URL("./ocr/ocrWorker.ts", import.meta.url), { type: "module" }),
  );
  return link.recognize(rgba, width, height, allowDownload);
}
