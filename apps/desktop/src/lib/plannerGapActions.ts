/**
 * Purpose: pure gap/coverage computation for a selected goal, split out of plannerStore.ts
 * to keep that file under the file-size ceiling. No React/zustand here.
 * Main exports: computeGapForGoal.
 */
import type { GoalRow, KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { coverage, type GapAndPathResult, gapAndPath } from "@breadcrumb/plugin-planner";

export function computeGapForGoal(
  goal: GoalRow | null,
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  masteryByNode: ReadonlyMap<string, number>,
  interestByNode: ReadonlyMap<string, number>,
): { gap: GapAndPathResult | null; coverageFraction: number | null } {
  if (goal === null) return { gap: null, coverageFraction: null };
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  return {
    gap: gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds,
      litThreshold: LIT_THRESHOLD,
    }),
    coverageFraction: coverage(goalNodeIds, masteryByNode, LIT_THRESHOLD),
  };
}
