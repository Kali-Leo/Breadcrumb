/**
 * Purpose: pure gap/coverage/route computation for a selected goal, split out of
 * plannerStore.ts to keep that file under the file-size ceiling. No React/zustand here.
 * Main exports: computeGapForGoal, computeRouteForGoal, deriveGoalView, GoalView,
 * goalSatisfiedNodeIds, goalNodeIds.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import { NodeIdsJsonSchema, parseJsonColumn } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  coverage,
  type GapAndPathResult,
  gapAndPath,
  type RecommendedRouteStep,
  type RecommendRouteParams,
  recommendRoute,
} from "@breadcrumb/plugin-planner";

/** The goal's own node id list, read out of node_ids_json. A goal whose column is corrupt
 * reads as an empty goal rather than throwing through whichever screen happened to touch it:
 * every readout of this column (coverage, the route, the composition chips, both maps) shares
 * this one parse so they can never disagree about what a goal contains. */
export function goalNodeIds(goal: GoalRow): string[] {
  return parseJsonColumn(NodeIdsJsonSchema, goal.node_ids_json) ?? [];
}

/** Goal views believe the user's own word: a node with a 'learned' self-report claim leaves
 * THIS GOAL's remaining work and counts toward its coverage (vision/07 §4 — the goal trusts
 * you, memory stays honest). It is an id set, not a mastery number: the earlier version wrote
 * a fake LIT-threshold value into a copied mastery map, which both contradicted spec 011's own
 * acceptance criterion (self-report must weigh less than real footprints) and made one click
 * mean two different things on two screens — the goal page dropped the node while the palace's
 * frontier still treated its dependents as locked (2026-08-28 audit, planning gap 5).
 * Exported so every goal readout (coverage, the composition chips) applies the identical
 * belief — they must never silently disagree. */
export function goalSatisfiedNodeIds(claims: readonly MasteryClaimRow[]): Set<string> {
  return new Set(claims.filter((claim) => claim.level === "learned").map((claim) => claim.node_id));
}

export function computeGapForGoal(
  goal: GoalRow | null,
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  masteryByNode: ReadonlyMap<string, number>,
  interestByNode: ReadonlyMap<string, number>,
  claims: readonly MasteryClaimRow[],
): { gap: GapAndPathResult | null; coverageFraction: number | null } {
  if (goal === null) return { gap: null, coverageFraction: null };
  const nodeIds = goalNodeIds(goal);
  const satisfiedNodeIds = goalSatisfiedNodeIds(claims);
  return {
    gap: gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds: nodeIds,
      litThreshold: LIT_THRESHOLD,
      satisfiedNodeIds,
    }),
    coverageFraction: coverage(nodeIds, masteryByNode, LIT_THRESHOLD, satisfiedNodeIds),
  };
}

/** Same single-goal-view belief as computeGapForGoal, but returns the one recommended route
 * (spec 017 #1) instead of the legacy three. Null when no goal is selected. */
export function computeRouteForGoal(
  goal: GoalRow | null,
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  masteryByNode: ReadonlyMap<string, number>,
  interestByNode: ReadonlyMap<string, number>,
  claims: readonly MasteryClaimRow[],
  routeParams: RecommendRouteParams,
): RecommendedRouteStep[] | null {
  if (goal === null) return null;
  return recommendRoute(
    {
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds: goalNodeIds(goal),
      litThreshold: LIT_THRESHOLD,
      satisfiedNodeIds: goalSatisfiedNodeIds(claims),
    },
    routeParams,
  );
}

export interface GoalView {
  gap: GapAndPathResult | null;
  coverageFraction: number | null;
  route: RecommendedRouteStep[] | null;
}

/** Combines computeGapForGoal and computeRouteForGoal — everything plannerStore's
 * selectGoal/recomputeRoute need to derive from already-loaded state for one goal id. */
export function deriveGoalView(
  goal: GoalRow | null,
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  masteryByNode: ReadonlyMap<string, number>,
  interestByNode: ReadonlyMap<string, number>,
  claims: readonly MasteryClaimRow[],
  routeParams: RecommendRouteParams,
): GoalView {
  const { gap, coverageFraction } = computeGapForGoal(
    goal,
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    claims,
  );
  const route = computeRouteForGoal(
    goal,
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    claims,
    routeParams,
  );
  return { gap, coverageFraction, route };
}
