/**
 * Purpose: the shared similarity primitives the dedup tiers judge candidates with — cosine,
 * and the DISTRIBUTION-RELATIVE gate that replaced the absolute 0.85 threshold.
 *
 * Why relative: the local e5 model packs every real pair of this product's nodes into a
 * 0.147-wide band (measured on the live database, 2026-08-28: min 0.802, median 0.854, max
 * 0.949). An absolute cutoff anywhere in that band is arbitrary — 0.85 let 100% of nodes
 * reach a paid LLM judgment, and the alignment layer's 0.72 pruned literally nothing. A gate
 * computed from each node's OWN similarity landscape is immune to where the model happens to
 * put the band, which is why feature-graph's candidate ranking never had this bug.
 *
 * The math itself now lives in @breadcrumb/core-vectors, shared with the five other modules
 * that had each copied it (2026-09-02): one gate fraction, one cosine, so a threshold sweep
 * can no longer move four of the five.
 * Main exports: cosineSimilarity, RELATIVE_GATE_FRACTION, relativeGate, topByRelativeGate.
 */
import { relativeGate as gateOfBaseline, similarityBaseline } from "@breadcrumb/core-vectors";

export { cosineSimilarity, RELATIVE_GATE_FRACTION } from "@breadcrumb/core-vectors";

/** Relative-gate threshold over one subject's own similarity landscape: mean plus a fraction
 * of the gap up to its best match (see core-vectors for why the mean is clamped to best). */
export function relativeGate(similarities: readonly number[]): number {
  return gateOfBaseline(similarityBaseline(similarities));
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
