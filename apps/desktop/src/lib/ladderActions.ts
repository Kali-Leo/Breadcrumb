/**
 * Purpose: pure knowledge-snapshot builder plus the metered LLM calls of the three-stage
 * ladder pipeline (spec 032) — rung assessment on the configured model, one-time whole-
 * ladder composition on the strongest available model. No React/zustand here.
 * Main exports: buildKnowledgeSnapshot, requestLadderRung, requestTitleLadder,
 * LadderKnowledgeSnapshot.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildRungAssessmentMessages,
  buildTitleLadderMessages,
  type LadderAssessmentInput,
  type LadderKnowledgeItem,
  type RungAssessmentResult,
  rungAssessmentSchema,
  type TitleLadderResult,
  titleLadderSchema,
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

/** Stage 1: the rung assessment on the configured model — a low-variance judgement call.
 * Throws on failure; the caller decides how to degrade. */
export async function requestLadderRung(
  apiConfig: ApiConfig,
  input: LadderAssessmentInput,
): Promise<RungAssessmentResult> {
  const config = { ...apiConfig, fetchImpl: tauriFetch };
  const { parsed, usage } = await chatJson(
    config,
    buildRungAssessmentMessages(input),
    rungAssessmentSchema,
  );
  await recordMeteredCall({ purpose: "ladder", model: config.model, conversationId: null, usage });
  return parsed;
}

/** Creative work is model-tier sensitive: on a DeepSeek endpoint the one-time ladder
 * composition upgrades itself to the pro model; other providers keep the configured one. */
function strongestModelOf(apiConfig: ApiConfig): string {
  return apiConfig.model.startsWith("deepseek") ? "deepseek-v4-pro" : apiConfig.model;
}

/** Stage 2: the one-time whole-ladder composition (spec 032) — metered as "ladder-naming".
 * Throws on failure; the caller records it and keeps whatever board it had. */
export async function requestTitleLadder(
  apiConfig: ApiConfig,
  goalTitle: string,
): Promise<TitleLadderResult> {
  const model = strongestModelOf(apiConfig);
  const config = { ...apiConfig, model, fetchImpl: tauriFetch };
  const { parsed, usage } = await chatJson(
    config,
    buildTitleLadderMessages(goalTitle),
    titleLadderSchema,
  );
  await recordMeteredCall({ purpose: "ladder-naming", model, conversationId: null, usage });
  return parsed;
}
