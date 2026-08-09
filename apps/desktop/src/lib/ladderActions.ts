/**
 * Purpose: pure knowledge-snapshot builder plus the metered LLM call for the ladder's
 * real-time assessment (spec 022) — split out of ladderStore.ts to keep the store lean and
 * this logic independently testable. No React/zustand here.
 * Main exports: buildKnowledgeSnapshot, requestLadderAssessment, LadderKnowledgeSnapshot.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildLadderAssessmentMessages,
  type LadderAssessmentInput,
  type LadderAssessmentResult,
  type LadderKnowledgeItem,
  ladderAssessmentSchema,
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

/** The learner's concrete knowledge state over the goal's domain closure — the ONLY basis
 * the assessment ever sees (spec 022: never percentages, never progress). */
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

/** Calls the ladder-assessment LLM and meters it under purpose "ladder". Throws on failure —
 * the caller (ladderStore) decides how to degrade. */
export async function requestLadderAssessment(
  apiConfig: ApiConfig,
  input: LadderAssessmentInput,
): Promise<LadderAssessmentResult> {
  const config = { ...apiConfig, fetchImpl: tauriFetch };
  const { parsed, usage } = await chatJson(
    config,
    buildLadderAssessmentMessages(input),
    ladderAssessmentSchema,
  );
  await recordMeteredCall({ purpose: "ladder", model: config.model, conversationId: null, usage });
  return parsed;
}
