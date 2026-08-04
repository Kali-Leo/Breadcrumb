/**
 * Purpose: pure helpers plus the metered LLM call for the ranked ladder (spec 018) — split out
 * of ladderStore.ts to keep that file under the file-size ceiling and to keep the
 * row-shaping/display-merging logic independently testable. No React/zustand here.
 * Main exports: pickDomainLabelsSample, requestLadderGeneration, buildLadderRows,
 * buildLadderDisplayRows, LadderDisplayRow, rankProgressFraction.
 */
import type { GoalLadderRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildLadderGenerationMessages,
  type LadderGenerationInput,
  type LadderGenerationResult,
  ladderGenerationSchema,
  progressFromRank,
  type ValidatedLadderFigure,
} from "@breadcrumb/plugin-planner";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { recordMeteredCall } from "./metering";

/** Up to this many lit-node labels from the goal's own node set ground the model in what the
 * goal's domain actually is, without dumping the whole tree into the prompt. */
export function pickDomainLabelsSample(
  goalNodeIds: readonly string[],
  nodes: readonly KnowledgeNodeRow[],
  goalMasteryByNode: ReadonlyMap<string, number>,
  litThreshold: number,
  limit: number,
): string[] {
  const goalNodeIdSet = new Set(goalNodeIds);
  return nodes
    .filter(
      (node) => goalNodeIdSet.has(node.id) && (goalMasteryByNode.get(node.id) ?? 0) >= litThreshold,
    )
    .map((node) => node.label)
    .slice(0, limit);
}

/** Calls the ladder-generation LLM and meters it under purpose "ladder" (spec 016 four-piece
 * registration, mirroring plannerGoalActions.ts's requestGoalMapping). Throws on failure —
 * the caller (ladderStore) decides how to degrade. */
export async function requestLadderGeneration(
  apiConfig: ApiConfig,
  input: LadderGenerationInput,
): Promise<LadderGenerationResult> {
  const config = { ...apiConfig, fetchImpl: tauriFetch };
  const { parsed, usage } = await chatJson(
    config,
    buildLadderGenerationMessages(input),
    ladderGenerationSchema,
  );
  await recordMeteredCall({ purpose: "ladder", model: config.model, conversationId: null, usage });
  return parsed;
}

/** Turns a validated generation into insertable rows, all sharing the same generation number
 * and the learner's rank at generation time. `slotRanks` is `[...aboveRanks, ...belowRanks]`
 * (up to 5, rankEngine's neighborRanks output) — figure i (in validated batch order) is
 * anchored to slotRanks[i]. When fewer than 5 figures survive validation, the remaining below-
 * slots simply go unfilled this generation (a rare degrade, self-corrected by the next
 * regeneration) rather than forcing a thin board into all 5 anchors. */
export function buildLadderRows(
  goalId: string,
  generation: number,
  userRankAtGeneration: number,
  validated: readonly ValidatedLadderFigure[],
  slotRanks: readonly number[],
  newId: () => string,
  nowIso: () => string,
): GoalLadderRow[] {
  const createdAt = nowIso();
  return validated.map((figure, index) => ({
    id: newId(),
    goal_id: goalId,
    name: figure.name,
    age: figure.age,
    era: figure.era,
    occupation: figure.occupation,
    self_line: figure.selfLine,
    is_famous: figure.isFamous ? 1 : 0,
    rank: slotRanks[index] as number,
    position: figure.position,
    generation,
    user_rank_at_generation: userRankAtGeneration,
    chat_profile_json: JSON.stringify(figure.chatProfile),
    created_at: createdAt,
  }));
}

export interface LadderDisplayRow {
  /** "你" for the learner's own row. */
  name: string;
  /** null only for the learner's own inline row. */
  age: number | null;
  era: string | null;
  occupation: string | null;
  selfLine: string | null;
  rank: number;
  isUser: boolean;
}

/** Merges the stored figures with the learner's own row into one rank-ascending list for
 * display — the learner's row is a normal entry, not singled out visually beyond a UI
 * highlight the caller applies via `isUser`. A smaller rank number is better, so it sorts
 * first. */
export function buildLadderDisplayRows(
  figures: readonly Pick<
    GoalLadderRow,
    "name" | "age" | "era" | "occupation" | "self_line" | "rank"
  >[],
  currentUserRank: number,
): LadderDisplayRow[] {
  const rows: LadderDisplayRow[] = figures.map((figure) => ({
    name: figure.name,
    age: figure.age,
    era: figure.era,
    occupation: figure.occupation,
    selfLine: figure.self_line,
    rank: figure.rank,
    isUser: false,
  }));
  rows.push({
    name: "你",
    age: null,
    era: null,
    occupation: null,
    selfLine: null,
    rank: currentUserRank,
    isUser: true,
  });
  return rows.sort((a, b) => a.rank - b.rank);
}

/** 0..1 fraction of the way from "just entered this rank" to "one rank better", derived from
 * the rank curve's inverse (progressFromRank) rather than a fixed per-rank size — early ranks
 * span a huge progress range, late ranks a tiny one, and the bar should reflect that. Maxes
 * out at 1 for rank 1 (there is no better rank to progress toward). */
export function rankProgressFraction(progress: number, userRank: number): number {
  if (userRank <= 1) return 1;
  const lowerBound = progressFromRank(userRank);
  const upperBound = progressFromRank(userRank - 1);
  if (upperBound <= lowerBound) return 1;
  return Math.min(1, Math.max(0, (progress - lowerBound) / (upperBound - lowerBound)));
}
