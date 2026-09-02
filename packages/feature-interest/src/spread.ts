/**
 * Purpose: embedding-similarity neighborhood diffusion — a node with no direct interest
 * signal but close (by cosine similarity) to interested nodes inherits some of that
 * interest. Pure math, no DB, no I/O. Local cosine helper per 行为局部性 > DRY (mirrors
 * feature-graph/src/similarity.ts without depending on that package).
 * Main exports: spreadInterest, DEFAULT_SPREAD_FACTOR, SPREAD_SIMILARITY_FLOOR,
 * SPREAD_NEIGHBOR_TOP_K.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";

/** How much of the similarity-weighted neighborhood average bleeds into a node's own
 * score; 0 = no diffusion, 1 = a node with no signal fully inherits its neighbors'. */
export const DEFAULT_SPREAD_FACTOR = 0.3;

/** A neighbor below this cosine similarity is not a neighbor. Without a floor, every node in
 * the tree joins every other node's weighted average, so diffusion degenerates into adding a
 * global mean interest to everything and loses the locality that is its whole point. */
export const SPREAD_SIMILARITY_FLOOR = 0.5;

/** However many neighbors clear the floor, only the closest this many diffuse — the same
 * absolute cost ceiling feature-graph's DEFAULT_TOP_K_SIMILAR (= 8) puts on its own candidate
 * pool, for the same reason: it bounds the worst case (a node sitting in a dense cluster of
 * near-equal matches) without being the primary cutoff. Also caps the O(n²) sweep's damage as
 * the tree grows. */
export const SPREAD_NEIGHBOR_TOP_K = 8;

/** Diffuses per-node scores (e.g. curiosity) across the embedding neighborhood. Nodes
 * without an embedding pass through unchanged (own score, or 0 if absent). Diffusion only
 * ever fills the gap toward the neighborhood average — it never lowers a node's own score. */
export function spreadInterest(
  scoresByNodeId: ReadonlyMap<string, number>,
  embeddings: readonly NodeEmbeddingRow[],
  factor: number,
): Map<string, number> {
  const vectorByNodeId = parseVectorRows(embeddings, (row) => row.node_id);
  const nodeIds = [...vectorByNodeId.keys()];

  const result = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const own = scoresByNodeId.get(nodeId) ?? 0;
    const vector = vectorByNodeId.get(nodeId);
    if (vector === undefined) {
      result.set(nodeId, own);
      continue;
    }
    const neighborAverage = weightedNeighborAverage(
      nodeId,
      vector,
      nodeIds,
      vectorByNodeId,
      scoresByNodeId,
    );
    const spread = own + factor * neighborAverage * (1 - own);
    result.set(nodeId, Math.max(0, Math.min(1, spread)));
  }
  return result;
}

function weightedNeighborAverage(
  nodeId: string,
  vector: readonly number[],
  allNodeIds: readonly string[],
  vectorByNodeId: ReadonlyMap<string, readonly number[]>,
  scoresByNodeId: ReadonlyMap<string, number>,
): number {
  const neighbors: { id: string; similarity: number }[] = [];
  for (const otherId of allNodeIds) {
    if (otherId === nodeId) continue;
    const otherVector = vectorByNodeId.get(otherId);
    if (otherVector === undefined) continue;
    const similarity = cosineSimilarity(vector, otherVector);
    if (similarity < SPREAD_SIMILARITY_FLOOR) continue;
    neighbors.push({ id: otherId, similarity });
  }
  // Closest first, node id as the tie-break so the top-K cut is deterministic.
  neighbors.sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));

  let weightedSum = 0;
  let weightTotal = 0;
  for (const neighbor of neighbors.slice(0, SPREAD_NEIGHBOR_TOP_K)) {
    weightedSum += neighbor.similarity * (scoresByNodeId.get(neighbor.id) ?? 0);
    weightTotal += neighbor.similarity;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
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
