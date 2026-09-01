/**
 * Purpose: pairs of EXISTING nodes that stand out in each node's own similarity landscape —
 * the candidate list spec 015 #4's auto-merge sweep hands to the synonym-judge LLM tier
 * (mergePlan.ts's planSynonymVerdictMerges turns the "same" verdicts into merge
 * instructions). Pairs already linked via node_aliases, and pairs already judged once
 * (either verdict), never re-enter.
 * Main exports: findSuspectSynonymPairs, SuspectSynonymPair.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { packVectors, partnersOf } from "@breadcrumb/core-vectors";
import { topByRelativeGate } from "./similarityGate";
import { SYNONYM_CANDIDATE_TOP_K } from "./synonymGate";

export interface SuspectSynonymPair {
  nodeAId: string;
  nodeALabel: string;
  nodeBId: string;
  nodeBLabel: string;
  similarity: number;
}

export interface SuspectSynonymPairInput {
  nodes: readonly KnowledgeNodeRow[];
  embeddings: readonly NodeEmbeddingRow[];
  /** alias label -> node id; a pair whose two labels are already formally linked is skipped —
   * that synonymy is recorded, not merely "suspected". */
  aliasNodeIdByLabel: ReadonlyMap<string, string>;
  /** Keys of pairs already judged, normalized as `${smallerId}:${largerId}` (migration 0045's
   * node_pair_verdicts). Both verdicts count: "different" is exactly the answer that used to
   * be forgotten and re-bought on every startup. */
  judgedPairKeys: ReadonlySet<string>;
  /** At most this many partners per node survive the relative gate. */
  topK?: number;
}

/** Pair key with a stable order regardless of which side generated it. */
function pairKey(nodeIdA: string, nodeIdB: string): string {
  return nodeIdA <= nodeIdB ? `${nodeIdA}:${nodeIdB}` : `${nodeIdB}:${nodeIdA}`;
}

/**
 * For each node, the partners that clear ITS OWN relative gate (mean + half the gap to its
 * best match), capped at topK, deduplicated across the two directions and returned most
 * similar first. Replaces an absolute 0.85 cutoff that let 59% of all pairs through on the
 * live database — the e5 model's similarities are packed too tightly for any fixed number to
 * mean anything (design audit 2026-08-28 #1).
 */
export function findSuspectSynonymPairs(input: SuspectSynonymPairInput): SuspectSynonymPair[] {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const entries: { id: string; vector: number[] }[] = [];
  for (const row of input.embeddings) {
    if (!nodeById.has(row.node_id)) continue;
    entries.push({ id: row.node_id, vector: JSON.parse(row.vector_json) as number[] });
  }
  // Normalized once, compared as dot products (see @breadcrumb/core-vectors): same numbers as
  // the pairwise cosine this used to call, about eight times less time on a grown tree.
  const packed = packVectors(entries);

  const topK = input.topK ?? SYNONYM_CANDIDATE_TOP_K;
  const byKey = new Map<string, SuspectSynonymPair>();
  packed.ids.forEach((subjectId, subjectRow) => {
    const scored: { partnerId: string; similarity: number }[] = [];
    for (const partner of partnersOf(packed, subjectRow)) {
      const nodeA = nodeById.get(subjectId);
      const nodeB = nodeById.get(partner.id);
      if (nodeA === undefined || nodeB === undefined) continue;
      if (isAlreadyAliasLinked(nodeA, nodeB, input.aliasNodeIdByLabel)) continue;
      if (input.judgedPairKeys.has(pairKey(nodeA.id, nodeB.id))) continue;
      scored.push({ partnerId: partner.id, similarity: partner.similarity });
    }
    for (const entry of topByRelativeGate(scored, topK)) {
      const nodeA = nodeById.get(subjectId);
      const nodeB = nodeById.get(entry.partnerId);
      if (nodeA === undefined || nodeB === undefined) continue;
      const key = pairKey(nodeA.id, nodeB.id);
      if (byKey.has(key)) continue;
      const [first, second] = nodeA.id <= nodeB.id ? [nodeA, nodeB] : [nodeB, nodeA];
      byKey.set(key, {
        nodeAId: first.id,
        nodeALabel: first.label,
        nodeBId: second.id,
        nodeBLabel: second.label,
        similarity: entry.similarity,
      });
    }
  });
  return [...byKey.values()].sort(
    (a, b) => b.similarity - a.similarity || a.nodeAId.localeCompare(b.nodeAId),
  );
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
