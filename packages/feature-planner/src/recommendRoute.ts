/**
 * Purpose: pure single-route recommendation — greedy walk over a goal's gap (spec 017 #1),
 * replacing "three routes, learner picks" with "one route, learner tunes two human params".
 * Step score = (1-pace)*helpsSupport_norm + interestWeight*interest - pace*remainingDepth_norm,
 * deterministic tie-break score then label. No DB, no I/O.
 * Main exports: recommendRoute, RecommendRouteParams, RecommendedRouteStep, RouteStepReason,
 * ROUTE_INTEREST_CHIP_THRESHOLD.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { incomingNeighbors, outgoingNeighbors } from "@breadcrumb/feature-graph";
import {
  computeGap,
  type GapAndPathInput,
  helpsSupportWeight,
  isSatisfiedBy,
  readyNodes,
} from "./gapAndPath";
import { longestRequiresChainBelow } from "./graphDepth";

/** Interest score (0..1) a step needs before the UI's "兴趣" reason chip shows — mild
 * curiosity shouldn't earn the tag, matching propagate.ts's own propagation floor. */
export const ROUTE_INTEREST_CHIP_THRESHOLD = 0.3;

export interface RecommendRouteParams {
  /** 0 = steadiest (every step leans on prior support); 1 = fastest (shortest remaining
   * chain to the goal wins, support ignored). */
  pace: number;
  /** 0 = ignore interest entirely; 1 = interest can outweigh everything else. */
  interestWeight: number;
}

export interface RouteStepReason {
  /** Lit-or-earlier-in-route helps sources feeding this step, with weights — mirrors
   * FrontierReason.litHelpsSources. Powers the "帮衬来源 N 个" chip. */
  helpsSources: { label: string; weight: number }[];
  /** This step's own interest score, 0..1 — powers the "兴趣" chip above
   * ROUTE_INTEREST_CHIP_THRESHOLD. */
  interest: number;
  /** The single gap-internal dependent this step's completion makes ready (its last
   * outstanding prerequisite), when there is one — powers "通往「X」". Ties broken by the
   * deepest remaining chain, then label. */
  unlocks?: { label: string };
  /** True when this step is one of the goal's own nodes, not merely a prerequisite of one —
   * powers "目标内". */
  isGoalNode: boolean;
}

export interface RecommendedRouteStep {
  nodeId: string;
  label: string;
  score: number;
  reason: RouteStepReason;
}

/** Greedily orders a goal's gap into a single route: at each step, scores every ready node
 * and takes the highest, tie-broken by label. Deterministic — same input, same output. */
export function recommendRoute(
  input: GapAndPathInput,
  params: RecommendRouteParams,
): RecommendedRouteStep[] {
  const { nodes, edges, interestByNode, goalNodeIds } = input;
  const { pace, interestWeight } = params;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const goalNodeIdSet = new Set(goalNodeIds);
  const isLit = isSatisfiedBy(input);
  const byLabel = (a: string, b: string) =>
    (labelById.get(a) ?? a).localeCompare(labelById.get(b) ?? b);

  const gapNodeIds = computeGap(edges, goalNodeIds, isLit);
  const gapSet = new Set(gapNodeIds);
  const gapSize = gapNodeIds.length;
  const depthByNode = longestRequiresChainBelow(gapNodeIds, gapSet, edges);

  const remaining = new Set(gapNodeIds);
  const scheduledSet = new Set<string>();
  const steps: RecommendedRouteStep[] = [];

  while (remaining.size > 0) {
    const ready = readyNodes(remaining, scheduledSet, gapSet, edges);
    if (ready.length === 0) {
      throw new Error("recommendRoute: no ready node found — the requires graph has a cycle");
    }

    const isSettledBefore = (id: string) => isLit(id) || scheduledSet.has(id);
    const rawHelpsByNode = new Map(
      ready.map((id) => [id, helpsSupportWeight(id, edges, isSettledBefore)]),
    );
    const maxRawHelps = Math.max(0, ...rawHelpsByNode.values());
    const helpsNorm = (id: string) =>
      maxRawHelps === 0 ? 0 : (rawHelpsByNode.get(id) ?? 0) / maxRawHelps;
    const depthNorm = (id: string) => (gapSize === 0 ? 0 : (depthByNode.get(id) ?? 1) / gapSize);
    const score = (id: string) =>
      (1 - pace) * helpsNorm(id) +
      interestWeight * (interestByNode.get(id) ?? 0) -
      pace * depthNorm(id);

    const next = [...ready].sort((a, b) => score(b) - score(a) || byLabel(a, b))[0] as string;

    const helpsSources = (edges as readonly KnowledgeEdgeRow[])
      .filter(
        (edge) =>
          edge.edge_type === "helps" && edge.target_id === next && isSettledBefore(edge.source_id),
      )
      .map((edge) => ({
        label: labelById.get(edge.source_id) ?? edge.source_id,
        weight: edge.weight,
      }));

    scheduledSet.add(next);
    remaining.delete(next);

    const unlockCandidates = outgoingNeighbors(edges, next, "requires")
      .filter((id) => gapSet.has(id))
      .filter((dependentId) =>
        incomingNeighbors(edges, dependentId, "requires")
          .filter((id) => gapSet.has(id))
          .every((prerequisiteId) => scheduledSet.has(prerequisiteId)),
      );
    const unlocksId = [...unlockCandidates].sort(
      (a, b) => (depthByNode.get(b) ?? 0) - (depthByNode.get(a) ?? 0) || byLabel(a, b),
    )[0];

    steps.push({
      nodeId: next,
      label: labelById.get(next) ?? next,
      score: score(next),
      reason: {
        helpsSources,
        interest: interestByNode.get(next) ?? 0,
        ...(unlocksId !== undefined
          ? { unlocks: { label: labelById.get(unlocksId) ?? unlocksId } }
          : {}),
        isGoalNode: goalNodeIdSet.has(next),
      },
    });
  }

  return steps;
}
