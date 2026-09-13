/**
 * Purpose: what the browser edition answers when the app asks for local text embeddings —
 * the same gte-multilingual-base the desktop build runs through Rust, from the same ONNX
 * files, running in a Web Worker (embedding/embeddingWorker.ts). This module is the page's end
 * of that worker; the desktop bridge (apps/desktop/src/lib/platform/embeddings.ts) calls it
 * through the aliased `invoke("embed_texts")` and never knows the difference.
 *
 * Unlike the model this replaced, the two editions now run the identical graph at the
 * identical width, so a library built on one is comparable to a library built on the other and
 * there is no per-edition model name any more — see @breadcrumb/core-vectors EMBEDDING_MODEL.
 *
 * The download is 311 MB, fetched once on first use (network switch permitting) into the Cache
 * API and loaded from there ever after — and fetched in eighteen pieces, because no host this
 * edition can reach will serve a file that size (embedding/splitGraph.ts). Every failure
 * surfaces as a rejection that lands on the same degradation paths a failed native call takes.
 *
 * Main exports: embedTextsInBrowser, isEmbeddingModelLoaded, embeddingSpeed.
 */
import {
  createEmbeddingLink,
  type EmbeddingLink,
  type EmbeddingSpeed,
} from "./embedding/workerLink";

let link: EmbeddingLink | null = null;

export function isEmbeddingModelLoaded(): boolean {
  return link?.loaded ?? false;
}

/** How the last successful batch actually went. Null before one has. */
export function embeddingSpeed(): EmbeddingSpeed | null {
  return link?.speed ?? null;
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
