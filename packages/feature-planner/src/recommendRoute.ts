/**
 * Purpose: pure single-route recommendation — greedy walk over a goal's gap,
 * replacing "three routes, learner picks" with "one route, learner tunes two human params".
 * Step score = (1-pace)*helpsSupport_norm + interestWeight*interest - pace*remainingDepth_norm,
 * deterministic tie-break score then label. No DB, no I/O.
 * Main exports: recommendRoute, RecommendRouteParams, RecommendedRouteStep, RouteStepReason,
 * ROUTE_INTEREST_CHIP_THRESHOLD, DEFAULT_ROUTE_PARAMS, sanitizeRouteParams.
 */

import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { compareStable } from "@breadcrumb/core-text";
import { incomingNeighbors, outgoingNeighbors } from "@breadcrumb/feature-graph";
import { compareDesc } from "@breadcrumb/feature-memory";
import { z } from "zod";
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

/** Both sliders at the middle — what a learner who has never touched them gets. */
export const DEFAULT_ROUTE_PARAMS: RecommendRouteParams = { pace: 0.5, interestWeight: 0.5 };

/** Each slider is a fraction, and the score formula reads them as one: `1 - pace` weighs
 * helps-support and `-pace` weighs remaining depth, so a pace of -3 turns the support term
 * into a 4x reward and the depth penalty into a bonus — a "route" that is neither steady nor
 * fast, silently. */
const RouteParamsSchema = z.object({
  pace: z.number().min(0).max(1),
  interestWeight: z.number().min(0).max(1),
});

/**
 * Route params from wherever they were stored, with anything unusable replaced by its
 * default. Never throws — bad settings degrade to defaults, exactly like
 * sanitizeRecommendationWeights does for the frontier's weight table.
 *
 * Why this exists: the settings row is read back with a bare
 * `JSON.parse(...) as Value`, and a bare `routeParams ?? DEFAULT_ROUTE_PARAMS` guard
 * catches a missing row and nothing inside one. A row missing `pace` — an old version's
 * leftovers, a hand-edited dev database, an import — would make `(1 - undefined)` NaN, every
 * step score NaN, and the greedy comparator return NaN at every step, so the route would come
 * out in whatever order the gap happened to enumerate. `z.number()` in Zod v4 also rejects NaN
 * and Infinity, so those cannot reach the arithmetic either.
 */
export function sanitizeRouteParams(stored: unknown): RecommendRouteParams {
  const whole = RouteParamsSchema.safeParse(stored);
  if (whole.success) return whole.data;
  // Field by field, so one broken slider does not throw away the other one's stored value.
  const fields: Record<string, unknown> =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const field = (name: keyof RecommendRouteParams) => {
    const parsed = RouteParamsSchema.shape[name].safeParse(fields[name]);
    return parsed.success ? parsed.data : DEFAULT_ROUTE_PARAMS[name];
  };
  return { pace: field("pace"), interestWeight: field("interestWeight") };
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
  // Sanitized here, at the point the numbers become arithmetic, so every caller is covered by
  // one guard rather than each remembering to apply it.
  const { pace, interestWeight } = sanitizeRouteParams(params);
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const goalNodeIdSet = new Set(goalNodeIds);
  const isLit = isSatisfiedBy(input);
  const byLabel = (a: string, b: string) =>
    compareStable(labelById.get(a) ?? a, labelById.get(b) ?? b);

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

    // compareDesc, not `score(b) - score(a)`: a NaN comparator result is read as "equal" and
    // the greedy walk then just takes ready[0] every time — a route in enumeration order.
    const next = [...ready].sort(
      (a, b) => compareDesc(score(a), score(b)) || byLabel(a, b),
    )[0] as string;

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
