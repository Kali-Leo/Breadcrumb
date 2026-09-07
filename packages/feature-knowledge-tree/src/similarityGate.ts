/**
 * Purpose: the shared similarity primitives the dedup tiers judge candidates with — cosine,
 * and the DISTRIBUTION-RELATIVE gate that replaced the absolute 0.85 threshold.
 *
 * Why relative: the local e5 model packs every real pair of this product's nodes into a
 * narrow similarity band. An absolute cutoff anywhere in that band is arbitrary — pick one
 * value and it lets through nearly everything, or nearly nothing. A gate
 * computed from each node's OWN similarity landscape is immune to where the model happens to
 * put the band, which is why feature-graph's candidate ranking never had this bug.
 *
 * The math itself lives in @breadcrumb/core-vectors, shared across modules: one gate
 * fraction, one cosine, so a threshold sweep changes it everywhere at once.
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
