/**
 * Purpose: what the browser edition answers when the app asks for local text embeddings.
 *
 * Today: nothing, honestly. The desktop build runs multilingual-e5-small through Rust; the
 * browser equivalent is transformers.js, which is tens of megabytes of model on first use and
 * drags a Node-only native toolchain (onnxruntime-node, sharp) through the dependency tree for
 * a build that will never run in Node. A first visit should be a working app, not a download,
 * so this edition ships without it.
 *
 * That is a real, deliberate reduction rather than an oversight — and the app is built for it.
 * Every consumer of embeddings already handles them being unavailable: the map falls back to
 * tree structure for its continents, node dedup skips its semantic tier and keeps the
 * mechanical one, edge candidates fall back to sibling and recency ranking, and concept-guess
 * grading drops to correct/wrong rather than offering "close". Nothing breaks; some things get
 * coarser, and the features page says which.
 *
 * Adding it later is a small, contained change: depend on @huggingface/transformers, load the
 * pipeline in `loadPipeline` below, and keep the "query: " prefix so the vectors stay
 * comparable with the desktop build's.
 *
 * Main exports: embedTextsInBrowser, isEmbeddingModelLoaded.
 */

/** Kept next to the code it will configure, so whoever enables this does not have to go
 * looking for which model the desktop build uses. */
export const DESKTOP_EMBEDDING_MODEL = "multilingual-e5-small";

export function isEmbeddingModelLoaded(): boolean {
  return false;
}

/**
 * Rejects rather than returning an empty array. `[]` would mean "these texts embed to
 * nothing", which reads to a caller as a successful result and would poison similarity
 * comparisons; a rejection lands on the same path a failed native call already takes, where
 * every caller degrades deliberately.
 */
export async function embedTextsInBrowser(
  texts: string[],
  _allowDownload: boolean,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  throw new Error(
    "local embeddings are not available in the browser edition; features that use them degrade",
  );
}
