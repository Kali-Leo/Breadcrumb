/**
 * Purpose: the create-goal journey action — maps a persona's targetConcepts onto a goal via
 * LLM, inserting any genuinely-new suggested nodes, and (P6 mirror) updating an existing goal
 * in place instead of inserting a duplicate when the trimmed title already exists. This
 * already persists the full mapping (existing + suggested) with no checkbox calibration step,
 * which is exactly the product flow the desktop lab panel was aligned to on 2026-08-02
 * (spec 012 §2) — no behavior change needed here, this file was already the target shape.
 * Main exports: applyCreateGoal.
 */
import { randomUUID } from "node:crypto";
import { chatJson } from "@breadcrumb/core-llm";
import { buildGoalMappingMessages, goalMappingSchema } from "@breadcrumb/plugin-planner";
import type { JourneyActionContext } from "./journeyActionTypes";
import type { TopicHint } from "./student";

export async function applyCreateGoal(context: JourneyActionContext): Promise<TopicHint> {
  const { repos, persona, llmConfig } = context;
  const allNodes = await repos.knowledgeNodes.listAll();
  const goalText = `学会：${persona.knowledge.targetConcepts.join("、")}`;
  try {
    const { parsed, usage } = await chatJson(
      llmConfig,
      buildGoalMappingMessages(
        goalText,
        allNodes.map((node) => node.label),
      ),
      goalMappingSchema,
    );
    context.recordCall("goal-planning", llmConfig.model, usage);
    context.logStage({ purpose: "goal-planning", request: goalText, response: parsed });

    const labelToId = new Map(allNodes.map((node) => [node.label, node.id]));
    const suggestedIds: string[] = [];
    for (const suggested of parsed.suggested) {
      if (labelToId.has(suggested.label)) continue; // avoid inserting a duplicate label
      const id = randomUUID();
      await repos.knowledgeNodes.insert({
        id,
        parent_id: null,
        label: suggested.label,
        summary: suggested.summary,
        kind: "concept",
        created_at: context.nowIso,
      });
      suggestedIds.push(id);
      labelToId.set(suggested.label, id);
    }
    const existingIds = parsed.existing
      .map((label) => labelToId.get(label))
      .filter((id): id is string => id !== undefined);
    const nodeIds = [...existingIds, ...suggestedIds];
    const trimmedTitle = goalText.trim();
    const existingGoals = await repos.goals.listAll();
    const duplicateGoal = existingGoals.find((goal) => goal.title.trim() === trimmedTitle);
    if (duplicateGoal !== undefined) {
      // Idempotent on title: refresh the existing goal instead of inserting a duplicate card.
      await repos.goals.updateNodeIds(duplicateGoal.id, nodeIds, context.nowIso);
    } else {
      await repos.goals.insert({
        id: randomUUID(),
        title: trimmedTitle,
        node_ids_json: JSON.stringify(nodeIds),
        created_at: context.nowIso,
        updated_at: context.nowIso,
      });
    }
  } catch (error) {
    context.recordFailure?.("goal-planning");
    context.logStage({
      purpose: "goal-planning",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { label: null, isDomainJump: false };
}
