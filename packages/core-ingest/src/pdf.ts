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
 * handed to pdfLines.ts to decide what is a heading. A page whose text layer is empty or
 * nearly so — a scanned book, a photographed handout, a page that is one picture — is rendered
 * to an image and handed to whatever recognizer the caller supplied, page by page, so the
 * caller can say how far along it is. Without a recognizer such pages are simply skipped,
 * which is what this did before OCR existed.
 * Main exports: configurePdfWorker, parsePdf, extractPdfLines, isScannedPage, PdfParseOptions.
 */
import type { DocumentBlock } from "./chunking";
import {
  groupIntoLines,
  type PdfLine,
  type PdfPageContent,
  type PdfTextItem,
  pagesToBlocks,
} from "./pdfLines";
import { type PageImage, renderPageImage } from "./pdfRender";

/** Points pdf.js at the worker script this app publishes. Call once, before any parse. */
export async function configurePdfWorker(workerSrc: string): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

/** Fewer characters than this on a page and the text layer is not the page's text: a page
 * number, a running head, a watermark left behind by the scanner. */
export const MIN_TEXT_LAYER_CHARACTERS = 20;

export interface PdfParseOptions {
  /** Reads the text off a page image, one line per string, in reading order. Called only for
   * pages the text layer cannot account for. `page` counts those pages, not the book's. */
  recognize?: (image: PageImage, page: { number: number; count: number }) => Promise<string[]>;
  /** How a recognized page is named in the heading path — "第 12 页", in the reader's
   * language. Only recognized pages are named; the text layer's own headings serve the rest. */
  pageLabel?: (pageNumber: number) => string;
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

/** True when the lines pdf.js found are too few to be the page: what is on it is an image. */
export function isScannedPage(lines: readonly PdfLine[]): boolean {
  const characters = lines.reduce((sum, line) => sum + line.text.replace(/\s+/g, "").length, 0);
  return characters < MIN_TEXT_LAYER_CHARACTERS;
}

type PdfJs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

async function pageLines(document: PdfDocument, pageNumber: number): Promise<PdfLine[]> {
  const page = await document.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    const items = content.items
      .map((item) => toTextItem(item as TextItemLike))
      .filter((item): item is PdfTextItem => item !== null);
    return groupIntoLines(items);
  } finally {
    page.cleanup();
  }
}

/** Opens the document for the duration of `use`, then releases it. `data` is transferred to
 * the worker and detached, so pdf.js gets its own copy: the caller may still want the bytes.
 * The loading task, not the document, owns the worker and has to be destroyed, or a long
 * import leaks one worker per file. */
async function withDocument<T>(
  data: Uint8Array,
  use: (document: PdfDocument) => Promise<T>,
): Promise<T> {
  const pdfjs = await import("pdfjs-dist");
  const task = pdfjs.getDocument({ data: data.slice() });
  const document = await task.promise;
  try {
    return await use(document);
  } finally {
    await task.destroy();
  }
}

/** Every line of the document, in reading order, pages concatenated. Text layer only. */
export async function extractPdfLines(data: Uint8Array): Promise<PdfLine[]> {
  return withDocument(data, async (document) => {
    const lines: PdfLine[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      lines.push(...(await pageLines(document, pageNumber)));
    }
    return lines;
  });
}

/**
 * Every page into blocks. The text layer is read first for the whole document, so that the
 * count of pages needing recognition is known before the first one is recognized — a
 * progress line that says "1 / 37" from the start is worth the extra pass, which is cheap.
 */
export async function parsePdf(
  data: Uint8Array,
  title: string,
  options: PdfParseOptions = {},
): Promise<DocumentBlock[]> {
  const { recognize, pageLabel = (pageNumber) => `${pageNumber}` } = options;
  return withDocument(data, async (document) => {
    const pages: PdfPageContent[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      pages.push({ lines: await pageLines(document, pageNumber) });
    }
    if (recognize === undefined) return pagesToBlocks(pages, title);
    const scanned = pages.flatMap((page, index) => (isScannedPage(page.lines) ? [index] : []));
    for (const [ordinal, index] of scanned.entries()) {
      const page = await document.getPage(index + 1);
      try {
        const image = await renderPageImage(page);
        const lines = await recognize(image, { number: ordinal + 1, count: scanned.length });
        // The stray characters of the text layer are dropped rather than kept beside the
        // recognized text: they were never the page, and now they would be a duplicate.
        pages[index] = { lines: [], recognized: { label: pageLabel(index + 1), lines } };
      } finally {
        page.cleanup();
      }
    }
    return pagesToBlocks(pages, title);
  });
}
