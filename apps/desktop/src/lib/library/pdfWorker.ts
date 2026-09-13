/**
 * Purpose: telling pdf.js where its own worker script is.
 *
 * pdf.js parses in a Worker, and it cannot find that Worker by itself in a bundled
 * application — the file it wants is inside node_modules, and in a build it is a hashed asset
 * at a URL only the bundler knows. Vite's `?url` import is how the bundler says. Left unset,
 * pdf.js falls back to parsing on the calling thread: correct, and slow enough to freeze the
 * interface for the length of a book, which is why this is called before the first parse
 * rather than hoped for.
 *
 * Once, and remembered: setting it again on every import would be harmless and calling it
 * from three places would not be obvious.
 * Main exports: ensurePdfWorker.
 */
import { configurePdfWorker } from "@breadcrumb/core-ingest";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configured: Promise<void> | null = null;

export function ensurePdfWorker(): Promise<void> {
  configured ??= configurePdfWorker(workerSrc);
  return configured;
}
