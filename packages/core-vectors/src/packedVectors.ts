/**
 * Purpose: the all-pairs similarity work that topic clustering and duplicate detection both
 * do, done once and done fast (2026-08-16 audit item "相似度 O(n²)→ANN 索引").
 *
 * Why not an ANN index, which is what that item proposed: both callers need each node's MEAN
 * similarity to every other node, because their gates are relative — "clears its own baseline
 * by half the gap to its best match" — and that baseline is what made them work at all on
 * e5-family embeddings, whose cosines all sit in a narrow high band (audit 病根三). An
 * approximate index returns a node's nearest few and says nothing about the mean, so it
 * cannot answer the question being asked. What was actually costing the time was the inner
 * loop: vectors stored as boxed JS numbers, and both norms recomputed for every pair.
 *
 * So the vectors are normalized once into one flat Float32Array, after which a cosine is a
 * dot product over contiguous memory. Same numbers, same gates, ~8× less time (measured on
 * 384-dimension vectors: 1000 nodes 1.5 s → 0.18 s, 2000 nodes 5.6 s → 0.7 s). At the scale
 * where even that stops being enough — tens of thousands of concepts — the honest move is a
 * sampled baseline plus an index, and that is a different design, not a faster loop.
 * Main exports: packVectors, similarityLandscape, partnersOf, PackedVectors.
 */

export interface PackedVectors {
  ids: string[];
  /** Row-major, L2-normalized: row i is [i * dims, (i + 1) * dims). */
  values: Float32Array;
  dims: number;
}

/** One node's place in the similarity landscape — what every relative gate is built on. */
export interface SimilarityBaseline {
  mean: number;
  best: number;
}

/**
 * Packs vectors into one normalized Float32Array. Entries with the wrong length, or with a
 * zero vector, are dropped: a vector that cannot be compared is not a silent zero-similarity
 * row, it is a row that does not belong in the landscape at all.
 */
export function packVectors(
  entries: readonly { id: string; vector: readonly number[] }[],
): PackedVectors {
  const dims = entries[0]?.vector.length ?? 0;
  const usable = entries.filter((entry) => entry.vector.length === dims && dims > 0);
  const ids: string[] = [];
  const values = new Float32Array(usable.length * dims);
  let row = 0;
  for (const entry of usable) {
    let norm = 0;
    for (let index = 0; index < dims; index += 1) {
      const value = entry.vector[index] ?? 0;
      norm += value * value;
    }
    if (norm === 0) continue;
    const scale = 1 / Math.sqrt(norm);
    for (let index = 0; index < dims; index += 1) {
      values[row * dims + index] = (entry.vector[index] ?? 0) * scale;
    }
    ids.push(entry.id);
    row += 1;
  }
  return { ids, values: values.subarray(0, row * dims), dims };
}

/** Cosine between two packed rows — a dot product, because the rows are already unit length. */
export function similarityBetween(packed: PackedVectors, rowA: number, rowB: number): number {
  const { values, dims } = packed;
  const baseA = rowA * dims;
  const baseB = rowB * dims;
  let dot = 0;
  for (let index = 0; index < dims; index += 1) {
    dot += (values[baseA + index] ?? 0) * (values[baseB + index] ?? 0);
  }
  return dot;
}

/**
 * Every node's mean and best similarity to the others, in one pass over the upper triangle.
 * Both halves of each pair are accumulated as it goes, so the O(n²) work happens once rather
 * than once per direction.
 */
export function similarityLandscape(packed: PackedVectors): SimilarityBaseline[] {
  const count = packed.ids.length;
  const sums = new Float64Array(count);
  const bests = new Float64Array(count);
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      const similarity = similarityBetween(packed, a, b);
      sums[a] = (sums[a] ?? 0) + similarity;
      sums[b] = (sums[b] ?? 0) + similarity;
      if (similarity > (bests[a] ?? 0)) bests[a] = similarity;
      if (similarity > (bests[b] ?? 0)) bests[b] = similarity;
    }
  }
  const divisor = Math.max(1, count - 1);
  return packed.ids.map((_id, index) => ({
    mean: count < 2 ? 0 : (sums[index] ?? 0) / divisor,
    best: bests[index] ?? 0,
  }));
}

/** One node's similarity to every other node, in packed row order (self excluded). */
export function partnersOf(
  packed: PackedVectors,
  row: number,
): { id: string; similarity: number }[] {
  const partners: { id: string; similarity: number }[] = [];
  for (let other = 0; other < packed.ids.length; other += 1) {
    if (other === row) continue;
    partners.push({
      id: packed.ids[other] as string,
      similarity: similarityBetween(packed, row, other),
    });
  }
  return partners;
}
