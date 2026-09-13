/**
 * Purpose: reading a PDF with pdf.js — the same code on both editions, because a PDF is bytes
 * and both editions can produce bytes (a file input in the browser, the fs plugin on the
 * desktop). Only where the bytes come from differs, and that is the app's business, not this
 * module's.
 *
 * pdf.js needs a Worker and cannot find one by itself in a bundler-built app, so the app hands
 * the URL in once at startup. Left unset, pdf.js falls back to doing the parsing on the calling
 * thread, which is correct and slow; that is the right failure for a feature nobody is waiting
 * on a frame for.
 *
 * Text extraction is deliberately mechanical: every text item, grouped into lines by baseline,
 * handed to pdfLines.ts to decide what is a heading. The one piece of real structure a PDF can
 * carry — an exported table of contents — is not read here yet; the heading inference is what
 * the measurements were designed around and it does not need the outline to work.
 * Main exports: configurePdfWorker, parsePdf, extractPdfLines.
 */
import type { DocumentBlock } from "./chunking";
import { groupIntoLines, linesToBlocks, type PdfLine, type PdfTextItem } from "./pdfLines";

/** Points pdf.js at the worker script this app publishes. Call once, before any parse. */
export async function configurePdfWorker(workerSrc: string): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

interface TextItemLike {
  str?: unknown;
  height?: unknown;
  transform?: unknown;
}

/** pdf.js's text items are a union that includes marked-content markers with no text at all,
 * and its `transform` is a raw six-number matrix. Both are narrowed here rather than cast,
 * because a malformed PDF reaches this code as ordinary data. */
function toTextItem(item: TextItemLike): PdfTextItem | null {
  const { str, height, transform } = item;
  if (typeof str !== "string" || str === "") return null;
  const y = Array.isArray(transform) && typeof transform[5] === "number" ? transform[5] : 0;
  return { text: str, height: typeof height === "number" ? height : 0, y };
}

/** Every line of the document, in reading order, pages concatenated. */
export async function extractPdfLines(data: Uint8Array): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist");
  // `data` is transferred to the worker and detached, so pdf.js gets its own copy: the caller
  // may still want the bytes (to hash them, to retry), and a detached buffer is a confusing
  // way to find that out.
  // The loading task, not the document, is what owns the worker and the network requests —
  // and it is the thing that has to be destroyed, or a long import leaks one worker per file.
  const task = pdfjs.getDocument({ data: data.slice() });
  const document = await task.promise;
  try {
    const lines: PdfLine[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item) => toTextItem(item as TextItemLike))
        .filter((item): item is PdfTextItem => item !== null);
      lines.push(...groupIntoLines(items));
      page.cleanup();
    }
    return lines;
  } finally {
    await task.destroy();
  }
}

export async function parsePdf(data: Uint8Array, title: string): Promise<DocumentBlock[]> {
  return linesToBlocks(await extractPdfLines(data), title);
}
