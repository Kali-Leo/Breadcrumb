/**
 * Purpose: pure candidate-pair generation between new and existing knowledge nodes — cosine
 * similarity ranking when embeddings exist, plus a same-parent/most-recent fallback when
 * they don't. No DB, no I/O.
 * Main exports: rankCandidatePairs, fallbackCandidatePairs, CandidatePair.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";

export interface CandidatePair {
  newNodeId: string;
  existingNodeId: string;
  /** Cosine similarity when ranked by embeddings; absent for fallback-strategy pairs. */
  similarity?: number;
}

/** Top-K most similar existing nodes for each new node, by cosine similarity of their
 * embeddings. Returns [] whenever a new node (or every existing node) has no embedding —
 * callers should fall back to fallbackCandidatePairs in that case. */
export function rankCandidatePairs(
  embeddings: readonly NodeEmbeddingRow[],
  newNodeIds: readonly string[],
  topK: number,
): CandidatePair[] {
  const vectorByNodeId = new Map(
    embeddings.map((row) => [row.node_id, JSON.parse(row.vector_json) as number[]]),
  );
  const newNodeIdSet = new Set(newNodeIds);
  const existingIds = [...vectorByNodeId.keys()].filter((id) => !newNodeIdSet.has(id));

  const pairs: CandidatePair[] = [];
  for (const newNodeId of newNodeIds) {
    const newVector = vectorByNodeId.get(newNodeId);
    if (newVector === undefined) continue;
    const ranked = existingIds
      .map((existingNodeId) => {
        const existingVector = vectorByNodeId.get(existingNodeId);
        return existingVector === undefined
          ? null
          : { existingNodeId, similarity: cosineSimilarity(newVector, existingVector) };
      })
      .filter((entry): entry is { existingNodeId: string; similarity: number } => entry !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    for (const entry of ranked) {
      pairs.push({ newNodeId, existingNodeId: entry.existingNodeId, similarity: entry.similarity });
    }
  }
  return pairs;
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

/** Degraded-mode candidate generation for when embeddings are unavailable: each new node
 * is paired with its tree siblings (same parent_id) plus the recentN most recently created
 * existing nodes overall. */
export function fallbackCandidatePairs(
  nodes: readonly KnowledgeNodeRow[],
  newNodeIds: readonly string[],
  recentN: number,
): CandidatePair[] {
  const newNodeIdSet = new Set(newNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const existingNodes = nodes.filter((node) => !newNodeIdSet.has(node.id));
  const mostRecentIds = [...existingNodes]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, recentN)
    .map((node) => node.id);

  const pairs: CandidatePair[] = [];
  for (const newNodeId of newNodeIds) {
    const newNode = nodeById.get(newNodeId);
    const siblingIds =
      newNode?.parent_id != null
        ? existingNodes
            .filter((node) => node.parent_id === newNode.parent_id)
            .map((node) => node.id)
        : [];
    const candidateIds = new Set([...siblingIds, ...mostRecentIds]);
    for (const existingNodeId of candidateIds) {
      pairs.push({ newNodeId, existingNodeId });
    }
  }
  return pairs;
}
