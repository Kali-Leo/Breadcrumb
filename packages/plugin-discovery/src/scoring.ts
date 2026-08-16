/**
 * Purpose: positive/negative exemplar similarity scoring for a candidate card against the
 * user's interest centroids — method after arxiv-sanity-lite's (MIT) positive/negative
 * example scoring and Qdrant's recommend API shape (positive + negative vector lists). Pure
 * math, no DB, no I/O.
 * Main exports: computeCentroid, scoreByCentroids.
 */

/** Weighted mean of a set of vectors. Zero-safe: an empty vector list returns an empty
 * vector, and a zero total weight (e.g. all-zero weights) returns the zero vector rather than
 * dividing by zero. */
export function computeCentroid(
  vectors: readonly number[][],
  weights: readonly number[],
): number[] {
  if (vectors.length === 0) return [];
  const dimension = vectors[0]?.length ?? 0;
  const sum = new Array<number>(dimension).fill(0);
  let weightTotal = 0;

  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i] ?? [];
    const weight = weights[i] ?? 0;
    weightTotal += weight;
    for (let d = 0; d < dimension; d++) {
      sum[d] = (sum[d] ?? 0) + (vector[d] ?? 0) * weight;
    }
  }

  if (weightTotal === 0) return new Array<number>(dimension).fill(0);
  return sum.map((value) => value / weightTotal);
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Candidate score = cos(candidate, positiveCentroid) − 0.6 × cos(candidate, negativeCentroid).
 * A null centroid (no evidence yet for that side) contributes 0 rather than being treated as
 * a zero vector, which would otherwise silently score as "maximally dissimilar". */
export function scoreByCentroids(
  candidate: readonly number[],
  positive: readonly number[] | null,
  negative: readonly number[] | null,
): number {
  const positiveScore = positive ? cosineSimilarity(candidate, positive) : 0;
  const negativeScore = negative ? cosineSimilarity(candidate, negative) : 0;
  return positiveScore - 0.6 * negativeScore;
}
