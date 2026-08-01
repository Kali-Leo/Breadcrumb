/**
 * Purpose: embedding-similarity neighborhood diffusion — a node with no direct interest
 * signal but close (by cosine similarity) to interested nodes inherits some of that
 * interest. Pure math, no DB, no I/O. Local cosine helper per 行为局部性 > DRY (mirrors
 * plugin-graph/src/similarity.ts without depending on that package).
 * Main exports: spreadInterest, DEFAULT_SPREAD_FACTOR.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";

/** How much of the similarity-weighted neighborhood average bleeds into a node's own
 * score; 0 = no diffusion, 1 = a node with no signal fully inherits its neighbors'. */
export const DEFAULT_SPREAD_FACTOR = 0.3;

/** Diffuses per-node scores (e.g. curiosity) across the embedding neighborhood. Nodes
 * without an embedding pass through unchanged (own score, or 0 if absent). Diffusion only
 * ever fills the gap toward the neighborhood average — it never lowers a node's own score. */
export function spreadInterest(
  scoresByNodeId: ReadonlyMap<string, number>,
  embeddings: readonly NodeEmbeddingRow[],
  factor: number,
): Map<string, number> {
  const vectorByNodeId = new Map(
    embeddings.map((row) => [row.node_id, JSON.parse(row.vector_json) as number[]]),
  );
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
  vectorByNodeId: ReadonlyMap<string, number[]>,
  scoresByNodeId: ReadonlyMap<string, number>,
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const otherId of allNodeIds) {
    if (otherId === nodeId) continue;
    const otherVector = vectorByNodeId.get(otherId);
    if (otherVector === undefined) continue;
    const similarity = cosineSimilarity(vector, otherVector);
    if (similarity <= 0) continue;
    weightedSum += similarity * (scoresByNodeId.get(otherId) ?? 0);
    weightTotal += similarity;
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
