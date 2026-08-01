/**
 * Purpose: goal-mapping LLM call and goal persistence helpers for plannerStore, split out so
 * the store itself stays under the file-size ceiling. No React/zustand here.
 * Main exports: requestGoalMapping, persistCalibratedGoal.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildGoalMappingMessages,
  type GoalMappingResult,
  goalMappingSchema,
  type SuggestedGoalNode,
} from "@breadcrumb/plugin-planner";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

/** Calls the goal-mapping LLM and meters it under purpose "goal-planning". Throws on
 * failure — the caller (plannerStore) decides how to degrade. */
export async function requestGoalMapping(
  apiConfig: ApiConfig,
  goalText: string,
  existingNodeLabels: readonly string[],
): Promise<GoalMappingResult> {
  const config = { ...apiConfig, fetchImpl: tauriFetch };
  const { parsed, usage } = await chatJson(
    config,
    buildGoalMappingMessages(goalText, existingNodeLabels),
    goalMappingSchema,
  );
  await recordMeteredCall({
    purpose: "goal-planning",
    model: config.model,
    conversationId: null,
    usage,
  });
  return parsed;
}

/** Inserts confirmed suggested nodes as sighting-free concept nodes (no fake evidence — they
 * start unlit), then saves the goal row over existing + newly-inserted node ids. */
export async function persistCalibratedGoal(
  title: string,
  existingLabels: readonly string[],
  suggested: readonly SuggestedGoalNode[],
  currentNodes: readonly KnowledgeNodeRow[],
): Promise<{ goalId: string; insertedNodes: boolean }> {
  const repos = await getRepos();
  const labelToId = new Map(currentNodes.map((node) => [node.label, node.id]));
  const createdAt = nowIso();

  const suggestedIds: string[] = [];
  for (const suggestedNode of suggested) {
    const id = newId();
    await repos.knowledgeNodes.insert({
      id,
      parent_id: null,
      label: suggestedNode.label,
      summary: suggestedNode.summary,
      kind: "concept",
      created_at: createdAt,
    });
    suggestedIds.push(id);
  }

  const existingIds = existingLabels
    .map((label) => labelToId.get(label))
    .filter((id): id is string => id !== undefined);
  const goalId = newId();
  await repos.goals.insert({
    id: goalId,
    title,
    node_ids_json: JSON.stringify([...existingIds, ...suggestedIds]),
    created_at: createdAt,
    updated_at: createdAt,
  });

  return { goalId, insertedNodes: suggestedIds.length > 0 };
}
