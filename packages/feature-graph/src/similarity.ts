/**
 * Purpose: pure candidate-pair generation between new and existing knowledge nodes — cosine
 * similarity ranking (gated relative to each new node's own similarity landscape, same
 * pattern as feature-map's topicGraph.ts) when embeddings exist, plus a same-parent/
 * most-recent fallback when they don't. No DB, no I/O. Cosine and the gate itself come from
 * @breadcrumb/core-vectors, so this module and the four others that used to keep private
 * copies can no longer drift apart (2026-09-02).
 * Main exports: rankCandidatePairs, fallbackCandidatePairs, CandidatePair,
 * DEFAULT_TOP_K_SIMILAR, DEFAULT_FALLBACK_RECENT_N.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";
import { cosineSimilarity, relativeGate, similarityBaseline } from "@breadcrumb/core-vectors";

/** Absolute cost ceiling: however many candidates clear the relative gate below, never send
 * more than this many per new node to the edge-judge LLM. Not the primary cutoff anymore —
 * see the relative gate below — this only bounds the worst case (a node with many
 * equally-strong matches). */
export const DEFAULT_TOP_K_SIMILAR = 8;

/** An existing node must clear core-vectors' RELATIVE_GATE_FRACTION of the gap between the
 * new node's mean and best similarity over the candidate pool to be offered to the edge-judge
 * LLM. A blind fixed top-3 truncates away a true prerequisite phrased differently the moment 3
 * more-literal matches outrank it; gating relative to the node's own mean/best keeps every
 * candidate that is genuinely close to its best match, not just the first few. */

/** Degraded-mode (no embeddings yet) fallback pool size: how many most-recently-created
 * existing nodes each new node gets paired against, alongside its tree siblings. */
export const DEFAULT_FALLBACK_RECENT_N = 5;

/** Upper bound on the tree siblings the fallback pairs a new node against — the same number
 * as DEFAULT_TOP_K_SIMILAR, so the degraded path can never be more expensive than the
 * embedding path it stands in for. Unbounded before (design audit 2026-08-28 #4): a parent
 * with 40 children produced 40 pairs for ONE new node, and the edge-judge schema only accepts
 * 20 verdicts per call, so the surplus was silently dropped after being paid for. Newest
 * siblings win, matching the recent-N pool's own bias. */
export const MAX_FALLBACK_SIBLINGS = DEFAULT_TOP_K_SIMILAR;

export interface CandidatePair {
  newNodeId: string;
  existingNodeId: string;
  /** Cosine similarity when ranked by embeddings; absent for fallback-strategy pairs. */
  similarity?: number;
}

/** Existing nodes that clear the relative similarity gate for each new node, capped at
 * `absoluteCap` (cost ceiling) most-similar. Returns [] whenever a new node (or every
 * existing node) has no embedding — callers should fall back to fallbackCandidatePairs in
 * that case. */
export function rankCandidatePairs(
  embeddings: readonly NodeEmbeddingRow[],
  newNodeIds: readonly string[],
  absoluteCap: number,
): CandidatePair[] {
  const vectorByNodeId = parseVectorRows(embeddings, (row) => row.node_id);
  const newNodeIdSet = new Set(newNodeIds);
  const existingIds = [...vectorByNodeId.keys()].filter((id) => !newNodeIdSet.has(id));

  const pairs: CandidatePair[] = [];
  for (const newNodeId of newNodeIds) {
    const newVector = vectorByNodeId.get(newNodeId);
    if (newVector === undefined) continue;
    const similarities = existingIds
      .map((existingNodeId) => {
        const existingVector = vectorByNodeId.get(existingNodeId);
        return existingVector === undefined
          ? null
          : { existingNodeId, similarity: cosineSimilarity(newVector, existingVector) };
      })
      .filter((entry): entry is { existingNodeId: string; similarity: number } => entry !== null);
    if (similarities.length === 0) continue;
    const gate = relativeGate(similarityBaseline(similarities.map((entry) => entry.similarity)));
    const ranked = similarities
      .filter((entry) => entry.similarity >= gate)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, absoluteCap);
    for (const entry of ranked) {
      pairs.push({ newNodeId, existingNodeId: entry.existingNodeId, similarity: entry.similarity });
    }
  }
  return pairs;
}

/** Degraded-mode candidate generation for when embeddings are unavailable: each new node
 * is paired with up to MAX_FALLBACK_SIBLINGS of its newest tree siblings (same parent_id)
 * plus the recentN most recently created existing nodes overall. Both pools are bounded, so
 * this path's pair count is bounded too. */
export function fallbackCandidatePairs(
  nodes: readonly KnowledgeNodeRow[],
  newNodeIds: readonly string[],
  recentN: number,
): CandidatePair[] {
  const newNodeIdSet = new Set(newNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const existingNodes = nodes.filter((node) => !newNodeIdSet.has(node.id));
  const newestFirst = [...existingNodes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const mostRecentIds = newestFirst.slice(0, recentN).map((node) => node.id);

  const pairs: CandidatePair[] = [];
  for (const newNodeId of newNodeIds) {
    const newNode = nodeById.get(newNodeId);
    const siblingIds =
      newNode?.parent_id != null
        ? newestFirst
            .filter((node) => node.parent_id === newNode.parent_id)
            .slice(0, MAX_FALLBACK_SIBLINGS)
            .map((node) => node.id)
        : [];
    const candidateIds = new Set([...siblingIds, ...mostRecentIds]);
    for (const existingNodeId of candidateIds) {
      pairs.push({ newNodeId, existingNodeId });
    }
  }
  return pairs;
}
