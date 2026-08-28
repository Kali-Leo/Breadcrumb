/**
 * Purpose: the two OPTIONAL proposal planners of one edge-judge result — learning-method
 * nodes, and (casual mode, spec 016) adjacent-unlearned-concept nodes — each turned into
 * knowledge_nodes rows plus their helps edges. Split out of plan.ts for the 200-line ceiling;
 * the pair-judgment planning it was extracted from stays there.
 * Main exports: planMethodNodes, planAdjacentConcepts, ADJACENT_CONCEPT_EDGE_CONFIDENCE.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { HELPS_WEIGHT_SCORES } from "./edgeJudge";
import type { EdgeJudgePlanInput } from "./plan";

/** Adjacent-concept proposals (spec 016) carry no separate confidence tier — helpsLevel is
 * the only judgment asked of the model for these. A fixed mid confidence keeps the edge from
 * silently outweighing an explicitly-judged helps edge without inventing an ungrounded number. */
export const ADJACENT_CONCEPT_EDGE_CONFIDENCE = 0.6;

export function planMethodNodes(input: EdgeJudgePlanInput): {
  methodNodesToInsert: KnowledgeNodeRow[];
  methodEdges: KnowledgeEdgeRow[];
} {
  const methodNodesToInsert: KnowledgeNodeRow[] = [];
  const methodEdges: KnowledgeEdgeRow[] = [];
  let nodeIdByLabel = new Map(input.nodeIdByLabel);

  for (const proposal of input.judged.methodNodes) {
    const targetIds = proposal.helpsLabels
      .map((label) => nodeIdByLabel.get(label))
      .filter((id): id is string => id !== undefined);
    if (targetIds.length === 0) continue; // nothing to attach to — skip creating an orphan
    const methodNode: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id: null,
      label: proposal.label,
      summary: proposal.summary,
      kind: "method",
      created_at: input.nowIso(),
    };
    methodNodesToInsert.push(methodNode);
    nodeIdByLabel = new Map(nodeIdByLabel).set(methodNode.label, methodNode.id);
    for (const targetId of targetIds) {
      methodEdges.push({
        id: input.newId(),
        source_id: methodNode.id,
        target_id: targetId,
        edge_type: "helps",
        weight: HELPS_WEIGHT_SCORES[proposal.weight],
        confidence: proposal.confidence,
        origin: "llm",
        created_at: input.nowIso(),
        // The method-node proposal carries no per-edge reasoning field; its summary is the
        // only justification the model gave, so that is what gets recorded.
        reasoning: proposal.summary,
        source_message_id: input.sourceMessageId,
      });
    }
  }
  return { methodNodesToInsert, methodEdges };
}

/** Casual-mode adjacent-concept proposals (spec 016) -> sighting-free concept nodes plus one
 * helps edge each, from the concept they connect to. Guards: a proposal whose label already
 * names a known node is skipped (it isn't actually unlearned/new); a proposal whose
 * connectsToLabel doesn't resolve to any known node is skipped (nothing to attach to); two
 * proposals in the same batch that repeat the same label only produce one node (dup guard).
 * No cycle guard needed — these edges are always 'helps', which isn't cycle-constrained
 * (see graph.ts's wouldCreateCycle, requires-only). */
export function planAdjacentConcepts(input: EdgeJudgePlanInput): {
  conceptNodesToInsert: KnowledgeNodeRow[];
  conceptEdges: KnowledgeEdgeRow[];
} {
  const conceptNodesToInsert: KnowledgeNodeRow[] = [];
  const conceptEdges: KnowledgeEdgeRow[] = [];
  const knownLabels = new Set(input.nodeIdByLabel.keys());

  for (const proposal of input.judged.adjacentConcepts) {
    if (knownLabels.has(proposal.label)) continue; // not actually new — skip the proposal
    const connectsToId = input.nodeIdByLabel.get(proposal.connectsToLabel);
    if (connectsToId === undefined) continue; // nothing to attach to — skip

    const conceptNode: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id: null,
      label: proposal.label,
      summary: proposal.summary,
      kind: "concept",
      created_at: input.nowIso(),
    };
    conceptNodesToInsert.push(conceptNode);
    knownLabels.add(conceptNode.label);
    conceptEdges.push({
      id: input.newId(),
      source_id: connectsToId,
      target_id: conceptNode.id,
      edge_type: "helps",
      weight: HELPS_WEIGHT_SCORES[proposal.helpsLevel],
      confidence: ADJACENT_CONCEPT_EDGE_CONFIDENCE,
      origin: "llm",
      created_at: input.nowIso(),
      reasoning: proposal.summary,
      source_message_id: input.sourceMessageId,
    });
  }
  return { conceptNodesToInsert, conceptEdges };
}
