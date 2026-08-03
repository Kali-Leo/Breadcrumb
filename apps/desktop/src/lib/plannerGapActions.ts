/**
 * Purpose: pure gap/coverage computation for a selected goal, split out of plannerStore.ts
 * to keep that file under the file-size ceiling. No React/zustand here.
 * Main exports: computeGapForGoal, masteryAsSeenByGoal.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { coverage, type GapAndPathResult, gapAndPath } from "@breadcrumb/plugin-planner";

/** Goal views believe the user's own word: a node with a 'learned' self-report claim counts
 * as satisfied FOR THE GOAL, while global mastery stays honest (ADR-0009 keeps self-report
 * capped below real-footprint evidence, so review can still gently resurface it later).
 * Exported so ladderStore.ts's milestone computation uses the exact same boosted view as
 * coverage() does here (spec 016 binding decision — milestone must never silently disagree
 * with the coverage percentage shown elsewhere). */
export function masteryAsSeenByGoal(
  masteryByNode: ReadonlyMap<string, number>,
  claims: readonly MasteryClaimRow[],
): Map<string, number> {
  const boosted = new Map(masteryByNode);
  for (const claim of claims) {
    if (claim.level !== "learned") continue;
    const current = boosted.get(claim.node_id) ?? 0;
    if (current < LIT_THRESHOLD) boosted.set(claim.node_id, LIT_THRESHOLD);
  }
  return boosted;
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
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  const goalMasteryByNode = masteryAsSeenByGoal(masteryByNode, claims);
  return {
    gap: gapAndPath({
      nodes,
      edges,
      masteryByNode: goalMasteryByNode,
      interestByNode,
      goalNodeIds,
      litThreshold: LIT_THRESHOLD,
    }),
    coverageFraction: coverage(goalNodeIds, goalMasteryByNode, LIT_THRESHOLD),
  };
}
