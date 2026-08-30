/**
 * Purpose: pure recommendation-frontier query — nodes one step beyond what's already lit,
 * ranked by a weighted sum of five components that are min-max normalized inside the candidate
 * set first (helps-support, interest, structural depth, goal-gap membership, browsing; see
 * frontierScore.ts). The hard gate reads "every requires-prerequisite has been lit at some
 * point", not "is lit right now" — forgetting decides what to review, not what you are allowed
 * to look at next. Concept candidates are bucketed ahead of method candidates, and the third
 * concept slot is reserved for the thinnest-evidence candidate. No DB, no I/O; mastery/interest
 * are pre-computed maps from the caller.
 * Main exports: frontier, FrontierCandidate, FrontierReason, FrontierInput,
 * GOAL_GAP_SCORE_BOOST, FRONTIER_WEIGHTS.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { incomingNeighbors } from "@breadcrumb/plugin-graph";
import { bucketConceptsFirst, type FrontierScoreParts, normalizeAndScore } from "./frontierScore";
import { longestRequiresChainBelow } from "./graphDepth";

export { EXPLORATION_SLOT_INDEX, FRONTIER_WEIGHTS, GOAL_GAP_SCORE_BOOST } from "./frontierScore";

export interface FrontierReason {
  /** Labels of this node's requires-prerequisites — all of them satisfied, since that's the
   * hard gate. "Satisfied" means lit now or lit at some point before (see FrontierInput's
   * previouslyLitNodeIds). */
  litPrerequisiteLabels: string[];
  /** Lit nodes whose helps edge points at this candidate, with that edge's weight. Unlike the
   * prerequisite gate this one stays on CURRENTLY lit: a prerequisite is a permission, a helps
   * source is live support the learner can actually lean on right now. */
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

export interface FrontierCandidate {
  nodeId: string;
  label: string;
  /** Node kind, echoed so callers can tell a method suggestion from a concept one without a
   * second lookup — and so the concept/method bucketing stays inspectable. */
  kind: KnowledgeNodeRow["kind"];
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
   * Two jobs: it drives FrontierReason.wasLitBefore, and it is half of the hard gate — a
   * prerequisite counts as satisfied if it is lit now OR listed here. Mastery is a retention
   * estimate that expires in days; gating structure on it means a deep node needs all its
   * prerequisites mentioned inside the same short window, which almost never happens.
   * Caller-supplied for the same layering reason as litThreshold. */
  previouslyLitNodeIds: ReadonlySet<string>;
  /** nodeId -> id of the dependent node whose locked interest propagated into it (spec 014,
   * propagate.ts's gatewaySourceByNode). Optional — omit when the caller didn't run
   * propagation; interestByNode is then read as-is with no gatewayTo reasons attached. */
  interestGatewayByNode?: ReadonlyMap<string, string>;
  /** nodeId -> interest evidenceWeight, surfaced on the candidate for the "依据尚少" UI tag,
   * and the signal the exploration slot ranks on. */
  evidenceWeightByNode?: ReadonlyMap<string, number>;
  /** Ranked-mode-only (spec 016): the selected goal's gap node ids. A candidate in this set
   * scores the goalGap component and gets reason.inGoalGap = true. Omit in casual mode or when
   * no goal is selected. */
  goalGapNodeIds?: ReadonlySet<string>;
  /** nodeId -> browsing-affinity score in [0,1] from watched professional content (spec
   * 059). A plain number: which video produced the score deliberately never leaves the
   * affinity computation (Leo 裁决 2026-08-30 — 知识点不标注来源视频). Omit (or pass empty)
   * when the interest service is absent — the component then carries no information and
   * cannot move the order. */
  browsingAffinityByNode?: ReadonlyMap<string, number>;
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

/** Nodes just beyond the lit frontier: every requires-prerequisite has been satisfied (lit now
 * or lit before — the hard gate; a node with zero requires-prerequisites also qualifies), but
 * the node itself is not lit right now. The "right now" on the candidate's own exclusion is
 * deliberate and differs from the gate: a decayed node has to be able to come back as a
 * reunion candidate. Ordered by score desc then label inside each kind bucket, concepts first,
 * with the third concept position reserved for exploration. */
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
    browsingAffinityByNode,
  } = input;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const isLit = (nodeId: string) => (masteryByNode.get(nodeId) ?? 0) >= litThreshold;
  const wasEverLit = (nodeId: string) => isLit(nodeId) || previouslyLitNodeIds.has(nodeId);
  const helpsByTarget = incomingHelpsEdgesByTarget(edges);
  const allNodeIds = nodes.map((node) => node.id);
  const depthByNode = longestRequiresChainBelow(allNodeIds, new Set(allNodeIds), edges);

  const candidates: FrontierCandidate[] = [];
  const parts: FrontierScoreParts[] = [];
  for (const node of nodes) {
    if (isLit(node.id)) continue;
    const prerequisiteIds = incomingNeighbors(edges, node.id, "requires");
    if (!prerequisiteIds.every(wasEverLit)) continue;

    const litHelpsSources = (helpsByTarget.get(node.id) ?? [])
      .filter((edge) => isLit(edge.source_id))
      .map((edge) => ({
        label: labelById.get(edge.source_id) ?? edge.source_id,
        weight: edge.weight,
      }));

    const gatewaySourceId = interestGatewayByNode?.get(node.id);
    const evidenceWeight = evidenceWeightByNode?.get(node.id);
    const inGoalGap = goalGapNodeIds?.has(node.id) ?? false;

    parts.push({
      helps: litHelpsSources.reduce((sum, source) => sum + source.weight, 0),
      interest: interestByNode.get(node.id) ?? 0,
      difficulty: depthByNode.get(node.id) ?? 1,
      goalGap: inGoalGap ? 1 : 0,
      browsing: browsingAffinityByNode?.get(node.id) ?? 0,
    });
    candidates.push({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      score: 0,
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

  const scores = normalizeAndScore(parts);
  const scored = candidates.map((candidate, index) => ({
    ...candidate,
    score: scores[index] ?? 0,
  }));
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return bucketConceptsFirst(scored, evidenceWeightByNode !== undefined);
}
