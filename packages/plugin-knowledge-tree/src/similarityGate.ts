/**
 * Purpose: the shared similarity primitives the dedup tiers judge candidates with — cosine,
 * and the DISTRIBUTION-RELATIVE gate that replaced the absolute 0.85 threshold.
 *
 * Why relative: the local e5 model packs every real pair of this product's nodes into a
 * 0.147-wide band (measured on the live database, 2026-08-28: min 0.802, median 0.854, max
 * 0.949). An absolute cutoff anywhere in that band is arbitrary — 0.85 let 100% of nodes
 * reach a paid LLM judgment, and the alignment layer's 0.72 pruned literally nothing. A gate
 * computed from each node's OWN similarity landscape is immune to where the model happens to
 * put the band, which is why plugin-graph's candidate ranking never had this bug.
 * Main exports: cosineSimilarity, RELATIVE_GATE_FRACTION, relativeGate, topByRelativeGate.
 */

/** Cosine helper, exported for in-package reuse (synonymGate.ts, suspectPairs.ts) and by
 * plugin-compare — mirrors plugin-graph/src/similarity.ts and plugin-interest/src/spread.ts's
 * own local copies rather than adding a cross-package dep for this one piece of math. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dotProduct += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** A candidate must clear μ + this fraction of (best − μ) of the subject's own similarity
 * landscape. Same constant and same meaning as plugin-graph/src/similarity.ts's RELATIVE_GATE. */
export const RELATIVE_GATE_FRACTION = 0.5;

/** Relative-gate threshold over one subject's own similarity landscape: mean plus a fraction
 * of the gap up to its best match. Mean is clamped to at most best: mean <= best always holds
 * mathematically, but independently-rounded floating-point sums can push the computed mean a
 * hair above the computed best when many candidates are near-identically similar — without
 * the clamp the gate would then exceed every candidate's similarity and reject the whole set.
 * (Copied deliberately from plugin-graph rather than shared: the two plugins have no
 * dependency edge between them, and this is six lines of arithmetic.) */
export function relativeGate(similarities: readonly number[]): number {
  let sum = 0;
  let best = 0;
  for (const similarity of similarities) {
    sum += similarity;
    best = Math.max(best, similarity);
  }
  const mean = similarities.length === 0 ? 0 : Math.min(sum / similarities.length, best);
  return mean + RELATIVE_GATE_FRACTION * (best - mean);
}

/** The entries clearing the relative gate, most similar first, capped at `topK`. A single
 * candidate always clears its own gate (mean === best), which is correct: with nothing to
 * compare against there is no landscape to be an outlier in, and the LLM judge is the layer
 * that decides. */
export function topByRelativeGate<Entry extends { similarity: number }>(
  entries: readonly Entry[],
  topK: number,
): Entry[] {
  if (entries.length === 0) return [];
  const gate = relativeGate(entries.map((entry) => entry.similarity));
  return entries
    .filter((entry) => entry.similarity >= gate)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
