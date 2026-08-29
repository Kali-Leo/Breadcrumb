/**
 * Purpose: pure assembly of the planner store's derived state from freshly-loaded repo rows —
 * mastery/interest aggregation, one-hop reverse interest propagation, ranked-mode frontier,
 * and the selected goal's gap/coverage/route. Split out of plannerStore.ts to keep that file
 * under the file-size ceiling. No DB, no zustand here.
 * Main exports: computePlannerSnapshot, PlannerSnapshot.
 */
import type {
  GoalRow,
  InterestSignalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
  NodeEmbeddingRow,
  NodeSightingRow,
} from "@breadcrumb/core-db";
import type { BrowsingNodeAffinity } from "@breadcrumb/plugin-browsing-interest";
import type { NodeInterestScore } from "@breadcrumb/plugin-interest";
import {
  aggregateInterest,
  DEFAULT_SPREAD_FACTOR,
  spreadInterest,
} from "@breadcrumb/plugin-interest";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  type FrontierCandidate,
  frontier,
  type GapAndPathResult,
  propagateInterestToPrerequisites,
  type RecommendedRouteStep,
  type RecommendRouteParams,
} from "@breadcrumb/plugin-planner";
import { computeGapForGoal, computeRouteForGoal } from "./plannerGapActions";

export interface PlannerSnapshot {
  masteryByNode: Map<string, number>;
  interestScoresByNode: Map<string, NodeInterestScore>;
  interestByNode: Map<string, number>;
  frontierCandidates: FrontierCandidate[];
  selectedGoalId: string | null;
  gap: GapAndPathResult | null;
  coverageFraction: number | null;
  route: RecommendedRouteStep[] | null;
  /** Every node id with at least one real conversation footprint, ever — distinct from mastery
   * (which self-report claims can also lift). Used only to approximate "this node arrived via
   * a goal's own suggestion" for the goal-composition chip list (spec 017 §1), since that
   * provenance isn't persisted at insert time. */
  sightedNodeIds: Set<string>;
}

export function computePlannerSnapshot(
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  sightings: readonly NodeSightingRow[],
  claims: readonly MasteryClaimRow[],
  signals: readonly InterestSignalRow[],
  embeddings: readonly NodeEmbeddingRow[],
  goals: readonly GoalRow[],
  requestedGoalId: string | null,
  isRanked: boolean,
  routeParams: RecommendRouteParams,
  now: string,
  /** Per-node browsing affinity from watched professional content (spec 059), or null when
   * the interest service / embedding model is unavailable — the frontier's browsing
   * component then carries no information. */
  browsingAffinityByNode: ReadonlyMap<string, BrowsingNodeAffinity> | null = null,
): PlannerSnapshot {
  const masteryByNode = computeMastery(sightings, claims, now);
  const interestScoresByNode = aggregateInterest(signals, now);
  const curiosityByNode = new Map(
    [...interestScoresByNode].map(([nodeId, score]) => [nodeId, score.curiosity]),
  );
  const interestByNode = spreadInterest(curiosityByNode, embeddings, DEFAULT_SPREAD_FACTOR);

  const previouslyLitNodeIds = new Set<string>([
    ...sightings.map((sighting) => sighting.node_id),
    ...claims.map((claim) => claim.node_id),
  ]);
  // One-hop reverse propagation (spec 014): a locked-but-interesting node lends interest to
  // its own unlit prerequisites, so frontier() can surface "gets you closer to X". gapAndPath
  // and recommendRoute intentionally keep using the un-propagated map.
  const propagated = propagateInterestToPrerequisites(
    edges,
    interestByNode,
    masteryByNode,
    LIT_THRESHOLD,
  );
  const evidenceWeightByNode = new Map(
    [...interestScoresByNode].map(([nodeId, score]) => [nodeId, score.evidenceWeight]),
  );

  const selectedGoalId = requestedGoalId ?? goals[0]?.id ?? null;
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
  const { gap, coverageFraction } = computeGapForGoal(
    selectedGoal,
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    claims,
  );
  const route = computeRouteForGoal(
    selectedGoal,
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    claims,
    routeParams,
  );

  // Ranked mode only (spec 016): the selected goal's gap gets a flat frontier boost, so
  // "what should I learn next" visibly favors goal progress over free wandering.
  const goalGapNodeIds = isRanked && gap ? new Set(gap.gapNodeIds) : undefined;

  const frontierCandidates = frontier({
    nodes,
    edges,
    masteryByNode,
    interestByNode: propagated.interestByNode,
    litThreshold: LIT_THRESHOLD,
    previouslyLitNodeIds,
    interestGatewayByNode: propagated.gatewaySourceByNode,
    evidenceWeightByNode,
    goalGapNodeIds,
    ...(browsingAffinityByNode !== null ? { browsingAffinityByNode } : {}),
  });

  return {
    masteryByNode,
    interestScoresByNode,
    interestByNode,
    frontierCandidates,
    selectedGoalId,
    gap,
    coverageFraction,
    route,
    sightedNodeIds: new Set(sightings.map((sighting) => sighting.node_id)),
  };
}
