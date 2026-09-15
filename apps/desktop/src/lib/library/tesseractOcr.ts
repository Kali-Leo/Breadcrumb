/**
 * Purpose: reading a scanned page in the three scripts the main recognizer does not cover —
 * Devanagari, Bengali and Arabic — through tesseract.js, on both editions.
 *
 * Why a second engine at all: PP-OCRv6 has no models for these scripts, PaddleOCR's older
 * script-specific models were measured at 10–16% character error, and tesseract's fast Hindi
 * data reads the same pages at 0.9% (docs/research/2026-09-14-OCR方案调研与实测.md). It is
 * chosen by the interface language, which is the one thing about the reader's material this
 * app can know before reading it — but only as the first guess. Which engine a page actually
 * gets is decided from what the engines say about it (lib/library/ocrRouting.ts), and for
 * that this module reports tesseract's own confidence in what it read beside the lines.
 *
 * Nothing of tesseract's is on the first screen: the library, its worker and its 3.9 MB
 * engine are separate chunks fetched on first use, and the language data comes from the same
 * repository the other models do, checked against a digest before it is handed over
 * (tesseractData.ts).
 * Main exports: TESSERACT_LANGUAGES, tesseractLanguageFor, recognizeWithTesseract.
 */
import type { PageImage } from "@breadcrumb/core-ingest";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import {
  DATA_BASES,
  ensureLanguageData,
  TESSERACT_CACHE_PATH,
  type TesseractLanguage,
} from "./tesseractData";

export { TESSERACT_LANGUAGES, tesseractLanguageFor } from "./tesseractData";

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
const workers = new Map<string, Promise<TesseractWorker>>();

/** How long the engine may take to come up before the import is told it did not. tesseract's
 * worker does not settle its promises when the engine aborts inside WebAssembly, and an import
 * that never finishes is worse than one that fails. */
const ENGINE_START_TIMEOUT_MS = 120_000;

function withinTime<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not start in time`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function getWorker(language: TesseractLanguage, allowDownload: boolean): Promise<TesseractWorker> {
  const existing = workers.get(language.code);
  if (existing !== undefined) return existing;
  const started = (async () => {
    await ensureLanguageData(language, allowDownload);
    const { createWorker, OEM } = await import("tesseract.js");
    const worker = createWorker(language.code, OEM.LSTM_ONLY, {
      workerPath: workerUrl,
      corePath: coreUrl,
      // The worker script is loaded from this origin directly rather than through a blob:
      // URL, which the content security policy of both editions refuses.
      workerBlobURL: false,
      // Read from the cache ensureLanguageData filled, and only from there; the host is
      // named so that a browser whose storage refused the write still has a way to the data.
      cachePath: TESSERACT_CACHE_PATH,
      cacheMethod: "readOnly",
      langPath: DATA_BASES[0] ?? "",
      logger: () => {},
      // Without one, tesseract throws from inside its message handler, where nothing catches.
      errorHandler: () => {},
    });
    return withinTime(worker, ENGINE_START_TIMEOUT_MS, "the recognition engine");
  })();
  workers.set(language.code, started);
  started.catch(() => workers.delete(language.code));
  return started;
}

/** tesseract reads an encoded image, not raw pixels, so the page goes through a canvas. */
function toBlob(image: PageImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("the canvas has no 2d context");
  const pixels = new Uint8ClampedArray(image.rgba.length);
  pixels.set(image.rgba);
  context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error("the page could not be encoded")) : resolve(blob),
      "image/png",
    );
  });
}

export interface TesseractReading {
  /** Lines of text, in reading order; blank lines dropped. */
  lines: string[];
  /** tesseract's mean word confidence over the page, 0 to 100. */
  confidence: number;
}

export async function recognizeWithTesseract(
  image: PageImage,
  language: TesseractLanguage,
  allowDownload: boolean,
): Promise<TesseractReading> {
  const worker = await getWorker(language, allowDownload);
  const { data } = await worker.recognize(await toBlob(image));
  const lines = data.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { lines, confidence: data.confidence };
}
