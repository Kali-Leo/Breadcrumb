/**
 * Purpose: between-conversation journey actions — the persona's PRNG-driven choice of what
 * to do next: follow a frontier recommendation (closes the loop on "is the recommendation
 * experience coherent"), self-report old knowledge, create a goal from its targetConcepts,
 * revisit an old topic, or jump to an unrelated domain. Each action either seeds the next
 * conversation's topic, exercises a real LLM pipeline and persists its result, or both.
 * Main exports: pickAndApplyJourneyAction, JourneyActionType, JourneyActionResult.
 */
import { randomUUID } from "node:crypto";
import { chatJson, type LlmClientConfig, type TokenUsage } from "@breadcrumb/core-llm";
import { buildSelfReportMessages, selfReportMappingSchema } from "@breadcrumb/plugin-interest";
import { buildGoalMappingMessages, goalMappingSchema } from "@breadcrumb/plugin-planner";
import type { SimlabRepos } from "../db/repos";
import type { Persona } from "../persona/schema";
import { pickWeighted } from "../util/prng";
import { computePlannerSnapshot } from "./plannerSnapshot";
import type { TopicHint } from "./student";

export type JourneyActionType =
  | "follow-frontier"
  | "self-report"
  | "create-goal"
  | "revisit-old-topic"
  | "jump-new-domain";

export interface JourneyActionResult {
  actionType: JourneyActionType;
  topicHint: TopicHint;
}

/** Default weights (tunable, not spec-mandated exact numbers) — follow-frontier gets the
 * largest share since closing the recommendation loop is the journey model's core realism
 * feature per spec 013 T3. */
const ACTION_WEIGHTS: { item: JourneyActionType; weight: number }[] = [
  { item: "follow-frontier", weight: 0.35 },
  { item: "self-report", weight: 0.15 },
  { item: "create-goal", weight: 0.15 },
  { item: "revisit-old-topic", weight: 0.2 },
  { item: "jump-new-domain", weight: 0.15 },
];

export interface JourneyActionContext {
  repos: SimlabRepos;
  persona: Persona;
  llmConfig: LlmClientConfig;
  nowIso: string;
  random: () => number;
  recordCall: (purpose: string, model: string, usage: TokenUsage) => void;
  recordFailure?: (purpose: string) => void;
  logStage: (record: Record<string, unknown>) => void;
  touchedLabelsSoFar: readonly string[];
}

export async function pickAndApplyJourneyAction(
  ctx: JourneyActionContext,
): Promise<JourneyActionResult> {
  const actionType = pickWeighted(ctx.random, ACTION_WEIGHTS);
  switch (actionType) {
    case "follow-frontier":
      return { actionType, topicHint: await applyFollowFrontier(ctx) };
    case "self-report":
      return { actionType, topicHint: await applySelfReport(ctx) };
    case "create-goal":
      return { actionType, topicHint: await applyCreateGoal(ctx) };
    case "revisit-old-topic":
      return { actionType, topicHint: applyRevisitOldTopic(ctx) };
    case "jump-new-domain":
      return {
        actionType,
        topicHint: { label: null, isDomainJump: true, domainHint: pickDomainHint(ctx) },
      };
    default:
      return { actionType, topicHint: { label: null, isDomainJump: false } };
  }
}

/** Picks one untouched-domain label from the persona's own brief (knownTopics ∪
 * targetConcepts, minus whatever this journey has already touched) via the shared PRNG, so
 * a jump-new-domain opener is actually grounded in something outside the touched-labels set
 * instead of leaving the student model to invent an arbitrary topic. Null when the persona's
 * whole brief has already been touched. */
function pickDomainHint(ctx: JourneyActionContext): string | null {
  const touched = new Set(ctx.touchedLabelsSoFar);
  const candidates = [
    ...new Set([...ctx.persona.knowledge.knownTopics, ...ctx.persona.knowledge.targetConcepts]),
  ].filter((label) => !touched.has(label));
  if (candidates.length === 0) return null;
  const index = Math.floor(ctx.random() * candidates.length);
  return candidates[index] ?? null;
}

async function applyFollowFrontier(ctx: JourneyActionContext): Promise<TopicHint> {
  const snapshot = await computePlannerSnapshot(ctx.repos, ctx.nowIso);
  const top = snapshot.frontierCandidates[0];
  return top === undefined
    ? { label: null, isDomainJump: false }
    : { label: top.label, isDomainJump: false };
}

async function applySelfReport(ctx: JourneyActionContext): Promise<TopicHint> {
  const { repos, persona, llmConfig } = ctx;
  if (persona.knowledge.knownTopics.length === 0) return { label: null, isDomainJump: false };
  const allNodes = await repos.knowledgeNodes.listAll();
  if (allNodes.length === 0) return { label: null, isDomainJump: false };

  const userText = `我以前学过：${persona.knowledge.knownTopics.join("、")}`;
  const existingLabels = allNodes.map((node) => node.label);
  try {
    const { parsed, usage } = await chatJson(
      llmConfig,
      buildSelfReportMessages(userText, existingLabels),
      selfReportMappingSchema,
    );
    ctx.recordCall("self-report-mapping", llmConfig.model, usage);
    ctx.logStage({ purpose: "self-report-mapping", request: userText, response: parsed });

    const nodeIdByLabel = new Map(allNodes.map((node) => [node.label, node.id]));
    for (const mapping of parsed.mappings) {
      const nodeId = nodeIdByLabel.get(mapping.label);
      if (nodeId === undefined) continue;
      await repos.masteryClaims.insert({
        id: randomUUID(),
        node_id: nodeId,
        level: mapping.claimLevel,
        source: "self-report",
        created_at: ctx.nowIso,
      });
    }
  } catch (error) {
    ctx.recordFailure?.("self-report-mapping");
    ctx.logStage({
      purpose: "self-report-mapping",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { label: null, isDomainJump: false };
}

async function applyCreateGoal(ctx: JourneyActionContext): Promise<TopicHint> {
  const { repos, persona, llmConfig } = ctx;
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
    ctx.recordCall("goal-planning", llmConfig.model, usage);
    ctx.logStage({ purpose: "goal-planning", request: goalText, response: parsed });

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
        created_at: ctx.nowIso,
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
      await repos.goals.updateNodeIds(duplicateGoal.id, nodeIds, ctx.nowIso);
    } else {
      await repos.goals.insert({
        id: randomUUID(),
        title: trimmedTitle,
        node_ids_json: JSON.stringify(nodeIds),
        created_at: ctx.nowIso,
        updated_at: ctx.nowIso,
      });
    }
  } catch (error) {
    ctx.recordFailure?.("goal-planning");
    ctx.logStage({
      purpose: "goal-planning",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { label: null, isDomainJump: false };
}

function applyRevisitOldTopic(ctx: JourneyActionContext): TopicHint {
  if (ctx.touchedLabelsSoFar.length === 0) return { label: null, isDomainJump: false };
  const index = Math.floor(ctx.random() * ctx.touchedLabelsSoFar.length);
  return { label: ctx.touchedLabelsSoFar[index] ?? null, isDomainJump: false };
}
