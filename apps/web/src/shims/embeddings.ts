/**
 * Purpose: what the browser edition answers when the app asks for local text embeddings —
 * the same multilingual-e5-small the desktop build runs through Rust, here as its q8 ONNX
 * export running in a Web Worker (embedding/embeddingWorker.ts) on ORT-wasm. This module is the
 * page's end of that worker; the desktop bridge (apps/desktop/src/lib/platform/embeddings.ts)
 * calls it through the aliased `invoke("embed_texts")` and never knows the difference.
 *
 * The model is 113 MB, downloaded once on first use (network switch permitting) into the
 * Cache API and loaded from there ever after. There is no prompt and no progress bar — the
 * desktop build has none either — and every failure surfaces as a rejection that lands on
 * the same degradation paths a failed native call already takes.
 *
 * Main exports: BROWSER_EMBEDDING_MODEL, embedTextsInBrowser, isEmbeddingModelLoaded.
 */
import { createEmbeddingLink, type EmbeddingLink } from "./embedding/workerLink";

/** What this edition's rows in node_embeddings are stamped with. The desktop build writes
 * "multilingual-e5-small" for its full-precision vectors; the suffix lets an exported library
 * say which precision made each row. Mirrored in the desktop bridge's EMBEDDING_MODEL. */
export const BROWSER_EMBEDDING_MODEL = "multilingual-e5-small-q8";

let link: EmbeddingLink | null = null;

export function isEmbeddingModelLoaded(): boolean {
  return link?.loaded ?? false;
}

/**
 * Rejects rather than returning an empty array on failure. `[]` would mean "these texts embed
 * to nothing", which reads to a caller as a successful result and would poison similarity
 * comparisons; a rejection lands where a failed native call already lands.
 */
export async function embedTextsInBrowser(
  texts: string[],
  allowDownload: boolean,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  link ??= createEmbeddingLink(
    () =>
      new Worker(new URL("./embedding/embeddingWorker.ts", import.meta.url), { type: "module" }),
  );
  return link.embed(texts, allowDownload);
}
