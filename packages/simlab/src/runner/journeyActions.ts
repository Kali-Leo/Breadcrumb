/**
 * Purpose: between-conversation journey actions — the persona's PRNG-driven choice of what
 * to do next: follow a frontier recommendation (closes the loop on "is the recommendation
 * experience coherent"), self-report old knowledge, create a goal from its targetConcepts,
 * revisit an old topic, or jump to an unrelated domain. Each action either seeds the next
 * conversation's topic, exercises a real LLM pipeline and persists its result, or both.
 * Self-report and create-goal are split into their own modules (selfReportAction.ts,
 * createGoalAction.ts) to stay under the file-size ceiling; shared types live in
 * journeyActionTypes.ts.
 * Main exports: pickAndApplyJourneyAction, JourneyActionType, JourneyActionResult,
 * JourneyActionContext, resolvePendingSelfReportTopics (re-exported for journey.ts's day-end
 * retry).
 */
import { pickWeighted } from "../util/prng";
import { applyCreateGoal } from "./createGoalAction";
import type {
  JourneyActionContext,
  JourneyActionResult,
  JourneyActionType,
} from "./journeyActionTypes";
import { computePlannerSnapshot } from "./plannerSnapshot";
import { applySelfReport, resolvePendingSelfReportTopics } from "./selfReportAction";
import type { TopicHint } from "./student";

export type { JourneyActionContext, JourneyActionResult, JourneyActionType };
export { resolvePendingSelfReportTopics };

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

function applyRevisitOldTopic(ctx: JourneyActionContext): TopicHint {
  if (ctx.touchedLabelsSoFar.length === 0) return { label: null, isDomainJump: false };
  const index = Math.floor(ctx.random() * ctx.touchedLabelsSoFar.length);
  return { label: ctx.touchedLabelsSoFar[index] ?? null, isDomainJump: false };
}
