/**
 * Purpose: how many texts the model sees at once, as a plain function so the batching can be
 * tested without a model.
 *
 * There is no task prefix any more, and its absence is the point. The e5 model this replaced
 * required "query: " on every text and lost several points without it; gte-multilingual-base
 * takes no prefix at all, and carrying the old habit over would quietly degrade every vector.
 * The desktop build (src-tauri/src/embeddings.rs) sends the text unprefixed too — the two
 * editions store vectors under one model name now, so they have to agree exactly.
 * Main exports: MAX_TEXTS_PER_BATCH, splitIntoBatches.
 */

/** Batching amortises the per-call overhead of the runtime without holding an unbounded
 * batch's activations in memory at once. This model is two and a half times the size of the
 * one before it, so the ceiling matters more than it did. */
export const MAX_TEXTS_PER_BATCH = 64;

/** Splits in order; the concatenation of the batches is the input. */
export function splitIntoBatches<T>(
  items: readonly T[],
  size: number = MAX_TEXTS_PER_BATCH,
): T[][] {
  if (size < 1) throw new RangeError("batch size must be at least 1");
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
