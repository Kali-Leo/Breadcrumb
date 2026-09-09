/**
 * Purpose: pure recommendation-frontier query — every unlit node, ranked by a weighted sum of
 * five min-max-normalized components (helps-support, interest, structural depth, goal-gap
 * membership, browsing; see frontierScore.ts) minus a flat demotion for prerequisites the
 * learner has not covered yet.
 *
 * There is no hard prerequisite gate. There used to be one — a node whose requires-edges were
 * not all satisfied never entered the candidate list at all — and it was removed because the
 * edges cannot carry that much weight. Measured against 115 hand-labelled pairs, six models
 * reproduce a human "A is a hard prerequisite of B" judgement 28–58% of the time; in the raw
 * judgements behind that number, 5–16% of the pairs a model DOES call requires come back with
 * the direction reversed relative to the human ordering, and nothing filters low-confidence
 * edges at write time. A gate turns each of those reversals into a concept removed from the
 * learner's recommendations permanently and invisibly — they never find out it exists.
 * Demotion fails softer: a reversed edge costs the node some rank, and the learner can still
 * meet it, see the missing prerequisite named in the reason, and judge for themselves.
 * "Satisfied" still reads "lit at some point", not "lit right now" — forgetting decides what
 * to review, not what you are allowed to look at next.
 *
 * Concept candidates are bucketed ahead of method candidates, and each bucket stays strictly
 * score-descending so visibleCount.ts can find the cliff in it. No DB, no I/O;
 * mastery/interest are pre-computed maps from the caller.
 * Main exports: frontier, FrontierCandidate, FrontierReason, FrontierInput,
 * GOAL_GAP_SCORE_BOOST, UNMET_PREREQUISITE_PENALTY, FRONTIER_WEIGHTS.
 */

import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { compareStable } from "@breadcrumb/core-text";
import { incomingNeighbors } from "@breadcrumb/feature-graph";
import { compareDesc } from "@breadcrumb/feature-memory";
import { bucketConceptsFirst, type FrontierScoreParts, normalizeAndScore } from "./frontierScore";
import type { FrontierCandidate, FrontierInput } from "./frontierTypes";
import { longestRequiresChainAbove } from "./graphDepth";

export {
  FRONTIER_WEIGHTS,
  type FrontierWeights,
  GOAL_GAP_SCORE_BOOST,
  UNMET_PREREQUISITE_PENALTY,
} from "./frontierScore";
export type { FrontierCandidate, FrontierInput, FrontierReason } from "./frontierTypes";

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

/** Every node that is not lit right now, ranked. Nodes with unsatisfied requires-prerequisites
 * are included and demoted, never dropped (see the file header). The candidate's own exclusion
 * stays on CURRENT mastery so a decayed node can come back as a reunion candidate. Ordered by
 * score desc then label inside each kind bucket, concepts first; the exploration slot is
 * applied later, by visibleFrontier, over the candidates it decided to show — reordering the
 * ranked list here would hide the score cliff from it. */
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
    weights,
  } = input;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const isLit = (nodeId: string) => (masteryByNode.get(nodeId) ?? 0) >= litThreshold;
  const wasEverLit = (nodeId: string) => isLit(nodeId) || previouslyLitNodeIds.has(nodeId);
  const helpsByTarget = incomingHelpsEdgesByTarget(edges);
  const allNodeIds = nodes.map((node) => node.id);
  // Prerequisite depth, not downstream depth: the score subtracts this, and 先挑轻松的 has
  // to mean "fewest things to make up first". See longestRequiresChainAbove. It counts the
  // whole chain, lit or not, so it reads as remoteness; the unmet-prerequisite demotion below
  // reads as reachability. Two different questions, both worth asking.
  const depthByNode = longestRequiresChainAbove(allNodeIds, new Set(allNodeIds), edges);

  const candidates: FrontierCandidate[] = [];
  const parts: FrontierScoreParts[] = [];
  for (const node of nodes) {
    if (isLit(node.id)) continue;
    const prerequisiteIds = incomingNeighbors(edges, node.id, "requires");
    const unlitPrerequisiteIds = prerequisiteIds.filter((id) => !wasEverLit(id));

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
      unmetPrerequisites: unlitPrerequisiteIds.length,
    });
    candidates.push({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      score: 0,
      reason: {
        litPrerequisiteLabels: prerequisiteIds
          .filter((id) => wasEverLit(id))
          .map((id) => labelById.get(id) ?? id),
        unlitPrerequisiteLabels: unlitPrerequisiteIds.map((id) => labelById.get(id) ?? id),
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

  const scores = normalizeAndScore(parts, weights);
  const scored = candidates.map((candidate, index) => ({
    ...candidate,
    score: scores[index] ?? 0,
  }));
  // compareDesc, not `b.score - a.score`: a NaN there makes every comparison false and V8
  // leaves the array untouched, i.e. the ranking silently becomes database insertion order.
  // normalizeAndScore no longer emits one, so this is the belt to that braces.
  scored.sort((a, b) => compareDesc(a.score, b.score) || compareStable(a.label, b.label));
  return bucketConceptsFirst(scored);
}
