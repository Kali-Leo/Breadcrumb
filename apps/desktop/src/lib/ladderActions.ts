/**
 * Purpose: pure helpers plus the metered LLM call for the ranked ladder (spec 020) — split out
 * of ladderStore.ts to keep that file under the file-size ceiling and to keep the
 * row-shaping/display-merging logic independently testable. No React/zustand here.
 * Main exports: buildKnowledgeSnapshot, requestLadderGeneration, buildLadderFigureRows,
 * buildLadderDisplayRows, LadderDisplayRow.
 */
import type { GoalLadderFigureRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildLadderGenerationMessages,
  type LadderGenerationInput,
  type LadderGenerationResult,
  type LadderKnowledgeItem,
  ladderGenerationSchema,
  type ValidatedLadderFigure,
} from "@breadcrumb/plugin-planner";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { recordMeteredCall } from "./metering";

/** Mastery at/above this reads as "熟" in the knowledge snapshot; between the goal's lit
 * threshold and this it reads as "刚学会", and anything faded-but-touched as "有点生疏". */
const SNAPSHOT_SOLID_THRESHOLD = 0.8;
/** Below this a node counts as not yet touched at all. */
const SNAPSHOT_TOUCHED_FLOOR = 0.2;
const SNAPSHOT_LEARNED_LIMIT = 12;
const SNAPSHOT_NOT_YET_LIMIT = 8;

export interface LadderKnowledgeSnapshot {
  learnedItems: LadderKnowledgeItem[];
  notYetLabels: string[];
}

/** The learner's concrete knowledge state over the goal's domain closure — the ONLY matching
 * basis the persona generation ever sees (spec 020: never percentages, never progress). */
export function buildKnowledgeSnapshot(
  closureNodeIds: readonly string[],
  nodes: readonly KnowledgeNodeRow[],
  goalMasteryByNode: ReadonlyMap<string, number>,
  litThreshold: number,
): LadderKnowledgeSnapshot {
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const learnedItems: LadderKnowledgeItem[] = [];
  const notYetLabels: string[] = [];
  for (const nodeId of closureNodeIds) {
    const label = labelById.get(nodeId);
    if (label === undefined) continue;
    const mastery = goalMasteryByNode.get(nodeId) ?? 0;
    if (mastery >= SNAPSHOT_TOUCHED_FLOOR) {
      if (learnedItems.length >= SNAPSHOT_LEARNED_LIMIT) continue;
      const freshness =
        mastery >= SNAPSHOT_SOLID_THRESHOLD
          ? "熟"
          : mastery >= litThreshold
            ? "刚学会"
            : "有点生疏";
      learnedItems.push({ label, freshness });
    } else if (notYetLabels.length < SNAPSHOT_NOT_YET_LIMIT) {
      notYetLabels.push(label);
    }
  }
  return { learnedItems, notYetLabels };
}

/** Calls the ladder-generation LLM and meters it under purpose "ladder". Throws on failure —
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

/** Turns a validated generation into insertable rows sharing one generation number. `slotRanks`
 * is `[...aboveRanks, ...belowRanks]` (rankEngine's neighborRanks output) — figure i (in
 * validated batch order) is anchored to slotRanks[i]. When fewer than 5 figures survive
 * validation the remaining slots go unfilled; the board simply runs thinner until its own
 * scheduled expiry regenerates it. */
export function buildLadderFigureRows(
  goalId: string,
  generation: number,
  validated: readonly ValidatedLadderFigure[],
  slotRanks: readonly number[],
  newId: () => string,
  nowIso: () => string,
): GoalLadderFigureRow[] {
  const createdAt = nowIso();
  return validated.map((figure, index) => ({
    id: newId(),
    goal_id: goalId,
    name: figure.name,
    age: figure.age,
    era: figure.era,
    occupation: figure.occupation,
    self_line: figure.selfLine,
    rank: slotRanks[index] as number,
    position: figure.position,
    generation,
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
    GoalLadderFigureRow,
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
