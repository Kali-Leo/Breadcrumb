/**
 * Purpose: small pure vector-math helpers shared by topic discovery — cosine similarity and
 * centroid (mean vector). No DB, no UI, no randomness.
 * Main exports: cosineSimilarity, computeCentroid.
 */

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeCentroid(
  memberIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): number[] {
  const vectors = memberIds
    .map((id) => embeddingByNodeId.get(id))
    .filter((vector): vector is readonly number[] => vector !== undefined);
  const dimensions = vectors[0]?.length ?? 0;
  const centroid = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      centroid[index] = (centroid[index] ?? 0) + (vector[index] ?? 0);
    }
  }
  if (vectors.length > 0) {
    for (let index = 0; index < dimensions; index += 1) {
      centroid[index] = (centroid[index] ?? 0) / vectors.length;
    }
  }
  return centroid;
}
