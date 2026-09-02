/**
 * Purpose: what happens to texts before the model sees them — the E5 task prefix and the
 * batch size — as plain functions so both can be tested without a model.
 *
 * The prefix is not optional. The desktop build (src-tauri/src/embeddings.rs) prepends the
 * same "query: " to every text, and the vectors on both editions are only comparable while
 * the two agree.
 * Main exports: QUERY_PREFIX, MAX_TEXTS_PER_BATCH, prefixForE5, splitIntoBatches.
 */

export const QUERY_PREFIX = "query: ";

/** Batching amortises the per-call overhead of the wasm runtime (single-threaded, one call
 * of 32 texts measured at 25 ms/text against 131 ms for one at a time) without holding an
 * unbounded batch's activations in memory at once. */
export const MAX_TEXTS_PER_BATCH = 64;

export function prefixForE5(text: string): string {
  return `${QUERY_PREFIX}${text}`;
}

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
