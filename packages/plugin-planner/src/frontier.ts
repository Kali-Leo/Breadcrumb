/**
 * Purpose: pure recommendation-frontier query — nodes one step beyond what's already lit,
 * scored by helps-support from mastered nodes plus interest minus an incoming-requires
 * difficulty estimate. In ranked mode (spec 016), candidates inside the caller's selected
 * goal's gap get a flat score boost so the frontier visibly favors goal progress. No DB, no
 * I/O; mastery/interest are pre-computed maps from the caller.
 * Main exports: frontier, FrontierCandidate, FrontierReason, FrontierInput,
 * GOAL_GAP_SCORE_BOOST.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { incomingNeighbors } from "@breadcrumb/plugin-graph";

export interface FrontierReason {
  /** Labels of this node's requires-prerequisites — all lit, since that's the hard gate. */
  litPrerequisiteLabels: string[];
  /** Lit nodes whose helps edge points at this candidate, with that edge's weight. */
  litHelpsSources: { label: string; weight: number }[];
  /** True when this node has any sighting/claim evidence at all — it was seen or claimed
   * before and has since decayed back under the lit threshold. Distinguishes "review" from
   * "brand new" so callers don't present a decayed-back-in node as fresh material. */
  wasLitBefore: boolean;
  /** Set when this candidate's interest score was raised by one-hop reverse propagation
   * (spec 014, propagate.ts) from a locked-but-interesting dependent — lets the UI explain
   * "this gets you closer to X" instead of a bare interest number. Absent when the caller
   * didn't run propagation, or this candidate's interest wasn't propagated. */
  gatewayTo?: { label: string };
  /** True when this candidate is inside the caller-supplied goalGapNodeIds set (ranked mode,
   * spec 016) — lets the UI show a "目标内" tag. Absent when the caller didn't supply one. */
  inGoalGap?: boolean;
}

/** Flat score boost for a frontier candidate inside the selected goal's gap (ranked mode,
 * spec 016) — enough to outrank ordinary helps/interest scoring so goal progress visibly
 * comes first, without needing to zero out everything else. */
export const GOAL_GAP_SCORE_BOOST = 1.0;

export interface FrontierCandidate {
  nodeId: string;
  label: string;
  score: number;
  reason: FrontierReason;
  /** This node's interest evidenceWeight (aggregateInterest's shrinkage mass), when the
   * caller supplies one. UI uses < 1 to show a subtle "依据尚少" (thin evidence) tag. */
  evidenceWeight?: number;
}

export interface FrontierInput {
  nodes: readonly KnowledgeNodeRow[];
  edges: readonly KnowledgeEdgeRow[];
  masteryByNode: ReadonlyMap<string, number>;
  interestByNode: ReadonlyMap<string, number>;
  /** Mastery value at/above which a node counts as lit. Caller-supplied so this package
   * never imports plugin-memory's threshold constant (keeps the mastery/planner layers
   * independent per ADR-0009). */
  litThreshold: number;
  /** Node ids with any sighting/claim evidence ever recorded, regardless of current mastery.
   * Drives FrontierReason.wasLitBefore — a decayed-back-under-threshold node is a review,
   * not a fresh recommendation. Caller-supplied for the same layering reason as
   * litThreshold: this package never touches raw sighting/claim rows. */
  previouslyLitNodeIds: ReadonlySet<string>;
  /** nodeId -> id of the dependent node whose locked interest propagated into it (spec 014,
   * propagate.ts's gatewaySourceByNode). Optional — omit when the caller didn't run
   * propagation; interestByNode is then read as-is with no gatewayTo reasons attached. */
  interestGatewayByNode?: ReadonlyMap<string, string>;
  /** nodeId -> interest evidenceWeight, surfaced on the candidate for the "依据尚少" UI tag. */
  evidenceWeightByNode?: ReadonlyMap<string, number>;
  /** Ranked-mode-only (spec 016): the selected goal's gap node ids. A candidate in this set
   * gets +GOAL_GAP_SCORE_BOOST and reason.inGoalGap = true. Omit in casual mode or when no
   * goal is selected — frontier() then scores exactly as before. */
  goalGapNodeIds?: ReadonlySet<string>;
}

/** Groups helps edges by their target node, computed once per call for O(nodes + edges). */
function incomingHelpsEdgesByTarget(
  edges: readonly KnowledgeEdgeRow[],
): Map<string, KnowledgeEdgeRow[]> {
  const byTarget = new Map<string, KnowledgeEdgeRow[]>();
  for (const edge of edges) {
    if (edge.edge_type !== "helps") continue;
    const list = byTarget.get(edge.target_id) ?? [];
    list.push(edge);
    byTarget.set(edge.target_id, list);
  }
  return byTarget;
}

/** Nodes just beyond the lit frontier: every requires-prerequisite is already lit (hard
 * gate — a node with zero requires-prerequisites also qualifies), but the node itself isn't
 * lit yet. Ordered score desc, then label, for deterministic UI rendering. */
export function frontier(input: FrontierInput): FrontierCandidate[] {
  const {
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    litThreshold,
    previouslyLitNodeIds,
    interestGatewayByNode,
    evidenceWeightByNode,
    goalGapNodeIds,
  } = input;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const isLit = (nodeId: string) => (masteryByNode.get(nodeId) ?? 0) >= litThreshold;
  const helpsByTarget = incomingHelpsEdgesByTarget(edges);

  const candidates: FrontierCandidate[] = [];
  for (const node of nodes) {
    if (isLit(node.id)) continue;
    const prerequisiteIds = incomingNeighbors(edges, node.id, "requires");
    if (!prerequisiteIds.every(isLit)) continue;

    const litHelpsSources = (helpsByTarget.get(node.id) ?? [])
      .filter((edge) => isLit(edge.source_id))
      .map((edge) => ({
        label: labelById.get(edge.source_id) ?? edge.source_id,
        weight: edge.weight,
      }));
    const helpsScore = litHelpsSources.reduce((sum, source) => sum + source.weight, 0);
    const interestScore = interestByNode.get(node.id) ?? 0;
    const difficultyEstimate = prerequisiteIds.length;

    const gatewaySourceId = interestGatewayByNode?.get(node.id);
    const evidenceWeight = evidenceWeightByNode?.get(node.id);
    const inGoalGap = goalGapNodeIds?.has(node.id) ?? false;

    candidates.push({
      nodeId: node.id,
      label: node.label,
      score:
        helpsScore + interestScore - difficultyEstimate + (inGoalGap ? GOAL_GAP_SCORE_BOOST : 0),
      reason: {
        litPrerequisiteLabels: prerequisiteIds.map((id) => labelById.get(id) ?? id),
        litHelpsSources,
        wasLitBefore: previouslyLitNodeIds.has(node.id),
        ...(gatewaySourceId !== undefined
          ? { gatewayTo: { label: labelById.get(gatewaySourceId) ?? gatewaySourceId } }
          : {}),
        ...(inGoalGap ? { inGoalGap: true } : {}),
      },
      ...(evidenceWeight !== undefined ? { evidenceWeight } : {}),
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
