/**
 * Purpose: goal-mapping LLM call and goal persistence/self-statement helpers for plannerStore,
 * split out so the store itself stays under the file-size ceiling. No React/zustand here.
 * Main exports: requestGoalMapping, persistCalibratedGoal, claimNodeAsLearned, removeNodeFromGoal.
 */
import type { GoalRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildGoalMappingMessages,
  type GoalMappingResult,
  goalMappingSchema,
} from "@breadcrumb/plugin-planner";
import { appEventBus } from "../stores/chatStore";
import type { ApiConfig } from "../stores/settingsStore";
import type { Repos } from "./db";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

/** Calls the goal-mapping LLM and meters it under purpose "goal-planning". Throws on
 * failure — the caller (plannerStore) decides how to degrade. */
export async function requestGoalMapping(
  apiConfig: ApiConfig,
  goalText: string,
  existingNodeLabels: readonly string[],
): Promise<GoalMappingResult> {
  const config = llmConfigFrom(apiConfig);
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

/** Inserts every suggested node as a sighting-free concept node (no fake evidence — they
 * start unlit), then saves the goal row over existing + newly-inserted node ids. Persists the
 * LLM mapping's full result — existing and suggested alike — immediately: there is no
 * checkbox calibration step (2026-08-02: a learner who hasn't studied the material can't
 * judge what belongs; domain judgment is the system's job, not a decision request placed on
 * the user).
 *
 * Idempotent on title: if a goal with the identical trimmed title already exists, its
 * node_ids_json/updated_at are refreshed in place instead of inserting a duplicate card
 * (a re-mapped goal text should update the same goal, not clone it — this is also how a
 * skipped node comes back: re-run 拆解目标 with the same title). */
export async function persistCalibratedGoal(
  repos: {
    knowledgeNodes: Pick<Repos["knowledgeNodes"], "insert">;
    goals: Pick<Repos["goals"], "listAll" | "insert" | "updateNodeIds">;
  },
  title: string,
  mapping: GoalMappingResult,
  currentNodes: readonly KnowledgeNodeRow[],
): Promise<{ goalId: string; insertedNodes: boolean }> {
  const labelToId = new Map(currentNodes.map((node) => [node.label, node.id]));
  const createdAt = nowIso();
  const trimmedTitle = title.trim();

  const suggestedIds: string[] = [];
  for (const suggestedNode of mapping.suggested) {
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

  const existingIds = mapping.existing
    .map((label) => labelToId.get(label))
    .filter((id): id is string => id !== undefined);
  const nodeIds = [...existingIds, ...suggestedIds];

  const existingGoals = await repos.goals.listAll();
  const duplicateGoal = existingGoals.find((goal) => goal.title.trim() === trimmedTitle);
  if (duplicateGoal !== undefined) {
    await repos.goals.updateNodeIds(duplicateGoal.id, nodeIds, createdAt);
    return { goalId: duplicateGoal.id, insertedNodes: suggestedIds.length > 0 };
  }

  const goalId = newId();
  await repos.goals.insert({
    id: goalId,
    title: trimmedTitle,
    node_ids_json: JSON.stringify(nodeIds),
    created_at: createdAt,
    updated_at: createdAt,
  });

  return { goalId, insertedNodes: suggestedIds.length > 0 };
}

/** "我已经会了" — a direct self-statement mastery claim for one gap node. No LLM call: the
 * learner already knows which node this is, so there is nothing to map. Emits
 * mastery:updated so every subscriber (plannerStore's own recompute included) picks it up;
 * the node leaves the gap the same way any other lit node would. */
export async function claimNodeAsLearned(
  repos: { masteryClaims: Pick<Repos["masteryClaims"], "insert"> },
  nodeId: string,
): Promise<void> {
  await repos.masteryClaims.insert({
    id: newId(),
    node_id: nodeId,
    level: "learned",
    source: "self-report",
    created_at: nowIso(),
  });
  appEventBus.emit("mastery:updated", { changedNodeIds: [nodeId] });
}

/** "先跳过" — removes one node id from a goal's own node_ids_json. No separate undo
 * mechanism: re-running 拆解目标 on the identical title restores the full mapped set via
 * persistCalibratedGoal's idempotent update. A no-op if the node wasn't an explicit member of
 * this goal's set (e.g. it's only present because another still-included node requires it as
 * a prerequisite — correctly so, since that prerequisite is still genuinely necessary). */
export async function removeNodeFromGoal(
  repos: { goals: Pick<Repos["goals"], "updateNodeIds"> },
  goal: GoalRow,
  nodeId: string,
): Promise<void> {
  const remainingNodeIds = (JSON.parse(goal.node_ids_json) as string[]).filter(
    (id) => id !== nodeId,
  );
  await repos.goals.updateNodeIds(goal.id, remainingNodeIds, nowIso());
}
