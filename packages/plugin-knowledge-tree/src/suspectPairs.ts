/**
 * Purpose: every pair of EXISTING nodes whose embeddings clear SYNONYM_SIMILARITY_THRESHOLD,
 * excluding pairs already formally linked via node_aliases — the candidate list spec 015 #4's
 * auto-merge sweep hands to the synonym-judge LLM tier (mergePlan.ts's
 * planSynonymVerdictMerges turns the "同一" verdicts into merge instructions).
 * Main exports: findSuspectSynonymPairs, SuspectSynonymPair.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { cosineSimilarity } from "./synonymGate";

export interface SuspectSynonymPair {
  nodeAId: string;
  nodeALabel: string;
  nodeBId: string;
  nodeBLabel: string;
  similarity: number;
}

/** Every existing-node pair whose embeddings clear `threshold`, most similar first. A pair
 * is skipped when node_aliases already links the two labels — that synonymy is already
 * formally recorded, not merely "suspected". */
export function findSuspectSynonymPairs(
  nodes: readonly KnowledgeNodeRow[],
  embeddings: readonly NodeEmbeddingRow[],
  aliasNodeIdByLabel: ReadonlyMap<string, string>,
  threshold: number,
): SuspectSynonymPair[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const vectorByNodeId = new Map(
    embeddings.map((row) => [row.node_id, JSON.parse(row.vector_json) as number[]]),
  );
  const ids = [...vectorByNodeId.keys()].filter((id) => nodeById.has(id));

  const pairs: SuspectSynonymPair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const idA = ids[i];
      const idB = ids[j];
      const nodeA = idA !== undefined ? nodeById.get(idA) : undefined;
      const nodeB = idB !== undefined ? nodeById.get(idB) : undefined;
      const vectorA = idA !== undefined ? vectorByNodeId.get(idA) : undefined;
      const vectorB = idB !== undefined ? vectorByNodeId.get(idB) : undefined;
      if (
        nodeA === undefined ||
        nodeB === undefined ||
        vectorA === undefined ||
        vectorB === undefined
      ) {
        continue;
      }
      if (isAlreadyAliasLinked(nodeA, nodeB, aliasNodeIdByLabel)) continue;
      const similarity = cosineSimilarity(vectorA, vectorB);
      if (similarity >= threshold) {
        pairs.push({
          nodeAId: nodeA.id,
          nodeALabel: nodeA.label,
          nodeBId: nodeB.id,
          nodeBLabel: nodeB.label,
          similarity,
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

function isAlreadyAliasLinked(
  nodeA: KnowledgeNodeRow,
  nodeB: KnowledgeNodeRow,
  aliasNodeIdByLabel: ReadonlyMap<string, string>,
): boolean {
  return (
    aliasNodeIdByLabel.get(nodeA.label) === nodeB.id ||
    aliasNodeIdByLabel.get(nodeB.label) === nodeA.id
  );
}
