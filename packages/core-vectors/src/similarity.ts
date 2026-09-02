/**
 * Purpose: the plain-array vector math every relative gate in the product is built on —
 * cosine similarity, the one shared gate fraction, and L2 normalization. Extracted 2026-09-02
 * from six near-identical private copies (feature-knowledge-tree, feature-graph,
 * feature-interest, feature-browsing-interest, feature-map, feature-diglot-weave): the copies
 * were justified as "行为局部性 > DRY", but they had already drifted — five truncated
 * mismatched vectors to the shorter length and one refused them — and the gate fraction lived
 * as four separate 0.5 literals, which is exactly how a threshold sweep goes wrong.
 *
 * The strict length check is the one kept: comparing a 384-dimension vector against a
 * 64-dimension one by silently ignoring 320 dimensions returns a flatteringly high cosine for
 * two things that were never comparable. Zero is the honest answer.
 * Main exports: cosineSimilarity, l2Normalize, RELATIVE_GATE_FRACTION, similarityBaseline,
 * relativeGate.
 */
import type { SimilarityBaseline } from "./packedVectors";

/** Cosine similarity of two vectors. Returns 0 when the lengths differ (incomparable) or
 * either side is a zero vector (no direction to compare). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dotProduct += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Unit-length copy of a vector, at full double precision. A zero vector has no direction to
 * scale, so it comes back as a plain copy — unlike packVectors, which drops such a row from
 * the landscape entirely (a row that cannot be compared does not belong in an all-pairs
 * sweep, but a caller normalizing one vector still wants a vector back). */
export function l2Normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return [...vector];
  return vector.map((value) => value / norm);
}

/** A candidate must clear μ + this fraction of (best − μ) of the subject's own similarity
 * landscape. One constant, because the 2026-08-28 audit's "100% of candidates pass, 0.023%
 * useful output" came from thresholds that disagreed across modules. */
export const RELATIVE_GATE_FRACTION = 0.5;

/** Mean and best of one subject's similarities. Mean is clamped to at most best: mean <= best
 * always holds mathematically, but independently-rounded floating-point sums can push the
 * computed mean a hair above the computed best when many candidates are near-identically
 * similar — without the clamp the gate would then exceed every candidate's similarity and
 * reject the whole set. An empty list has no landscape: {0, 0}. */
export function similarityBaseline(similarities: readonly number[]): SimilarityBaseline {
  let sum = 0;
  let best = 0;
  for (const similarity of similarities) {
    sum += similarity;
    best = Math.max(best, similarity);
  }
  const mean = similarities.length === 0 ? 0 : Math.min(sum / similarities.length, best);
  return { mean, best };
}

/** Relative-gate threshold over one subject's own similarity landscape: mean plus a fraction
 * of the gap up to its best match. Why relative and not an absolute cutoff: e5-family
 * embeddings pack every real pair of this product's nodes into a 0.147-wide band (measured on
 * the live database 2026-08-28: min 0.802, median 0.854, max 0.949), so an absolute threshold
 * anywhere in that band passes everything or nothing. */
export function relativeGate(baseline: SimilarityBaseline): number {
  return baseline.mean + RELATIVE_GATE_FRACTION * (baseline.best - baseline.mean);
}
