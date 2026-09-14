/**
 * Purpose: turning one page of a PDF into pixels a text recognizer can read.
 *
 * 200 dpi, because that is where the recognition models were measured: the research note's
 * error rates are for pages rendered at exactly this density, and a lower one costs accuracy
 * on small body text while a higher one costs time and memory for nothing. An A4 page comes
 * out at 1654 × 2339, well inside the detector's 4000-pixel ceiling.
 *
 * The canvas is the document's own, not an OffscreenCanvas: pdf.js renders on the calling
 * thread either way, both editions run inside a window, and a plain canvas is the one every
 * browser this app supports can hand pixels back from. This is the only DOM dependency in the
 * package and it is reached only when a page actually needs recognizing.
 * Main exports: PageImage, RENDER_DPI, renderPageImage.
 */
import type { PDFPageProxy } from "pdfjs-dist";

/** Pixels, row-major, four bytes each — what a canvas hands back, and what the recognizers
 * on both editions take without conversion. */
export interface PageImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export const RENDER_DPI = 200;
/** PDF user space is 72 units to the inch. */
const PDF_POINTS_PER_INCH = 72;

export async function renderPageImage(page: PDFPageProxy): Promise<PageImage> {
  if (typeof document === "undefined") {
    throw new Error("rendering a page needs a document to make a canvas in");
  }
  const viewport = page.getViewport({ scale: RENDER_DPI / PDF_POINTS_PER_INCH });
  const width = Math.max(1, Math.floor(viewport.width));
  const height = Math.max(1, Math.floor(viewport.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Opaque white underneath: a page with a transparent background would otherwise be black
  // text on black, and the models read nothing.
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("the canvas has no 2d context to read pixels from");
  const pixels = context.getImageData(0, 0, width, height).data;
  // Detach the canvas from the page's memory as soon as the pixels are out: a 200 dpi page is
  // fifteen megabytes, and a book is hundreds of them.
  canvas.width = 0;
  canvas.height = 0;
  return { width, height, rgba: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length) };
}
