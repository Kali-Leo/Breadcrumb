/**
 * Purpose: pure helpers plus the metered LLM call for the pseudo-ranked ladder (spec 016) —
 * split out of ladderStore.ts to keep that file under the file-size ceiling and to keep the
 * row-shaping/display-merging logic independently testable. No React/zustand here.
 * Main exports: pickDomainLabelsSample, requestLadderGeneration, buildLadderRows,
 * buildLadderDisplayRows, LadderDisplayRow.
 */
import type { GoalLadderRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildLadderGenerationMessages,
  type LadderGenerationInput,
  type LadderGenerationResult,
  ladderGenerationSchema,
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
 * and the learner's milestone at generation time. */
export function buildLadderRows(
  goalId: string,
  generation: number,
  userMilestoneAtGeneration: number,
  validated: readonly ValidatedLadderFigure[],
  newId: () => string,
  nowIso: () => string,
): GoalLadderRow[] {
  const createdAt = nowIso();
  return validated.map((figure) => ({
    id: newId(),
    goal_id: goalId,
    figure_desc: figure.figureDesc,
    figure_note: figure.figureNote,
    milestone: figure.milestone,
    position: figure.position,
    generation,
    user_milestone_at_generation: userMilestoneAtGeneration,
    created_at: createdAt,
  }));
}

export interface LadderDisplayRow {
  label: string;
  /** null only for the learner's own inline row. */
  note: string | null;
  milestoneValue: number;
  isUser: boolean;
}

/** Merges the 5 stored figures with the learner's own row into one milestone-descending list
 * for inline display — the learner's row is a normal entry, not singled out visually beyond
 * a UI highlight the caller applies via `isUser`. */
export function buildLadderDisplayRows(
  figures: readonly Pick<GoalLadderRow, "figure_desc" | "figure_note" | "milestone">[],
  currentMilestone: number,
): LadderDisplayRow[] {
  const rows: LadderDisplayRow[] = figures.map((figure) => ({
    label: figure.figure_desc,
    note: figure.figure_note,
    milestoneValue: figure.milestone,
    isUser: false,
  }));
  rows.push({ label: "你", note: null, milestoneValue: currentMilestone, isUser: true });
  return rows.sort((a, b) => b.milestoneValue - a.milestoneValue);
}
