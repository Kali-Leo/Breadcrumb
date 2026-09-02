/**
 * Purpose: small pure vector-math helpers shared by topic discovery. Cosine now comes from
 * @breadcrumb/core-vectors (2026-09-02 — one shared implementation instead of six copies);
 * the centroid stays here because it is topic-clustering's own idea of a group's middle.
 * Main exports: cosineSimilarity, computeCentroid.
 */

export { cosineSimilarity } from "@breadcrumb/core-vectors";

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
