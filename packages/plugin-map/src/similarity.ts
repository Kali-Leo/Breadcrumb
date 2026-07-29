/**
 * Purpose: vector math for the map — cosine similarity and cluster centroids.
 * Main exports: cosineSimilarity, centroid.
 */

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function centroid(vectors: readonly (readonly number[])[]): number[] {
  const first = vectors[0];
  if (!first) return [];
  const sum = new Array<number>(first.length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < sum.length; i++) {
      sum[i] = (sum[i] ?? 0) + (vector[i] ?? 0);
    }
  }
  return sum.map((value) => value / vectors.length);
}
