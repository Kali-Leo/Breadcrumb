/**
 * Purpose: runs one virtual day's worth of conversations for a journey — extracted from
 * journey.ts to stay under the file-size ceiling. Mutates the accumulator arrays passed in
 * (newNodeLabels/sightedNodeLabels/rejectedCyclicEdges/pipelineFailures/touchedLabels) the
 * same way journey.ts's own inline loop used to, and runs the between-conversation journey
 * action after each one.
 * Main exports: runJourneyDayConversations, DayConversationsContext, DayConversationsOutcome.
 */
import { randomUUID } from "node:crypto";
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import type { RejectedCyclicEdge } from "@breadcrumb/plugin-graph";
import type { SimlabRepos } from "../db/repos";
import type { RunTelemetry } from "../judges/telemetry";
import type { Persona } from "../persona/schema";
import { type mulberry32, randomFloat, randomInt } from "../util/prng";
import type { SessionLogWriter } from "./artifacts";
import { runConversation } from "./conversation";
import type { CostGuard } from "./costGuard";
import { pickAndApplyJourneyAction } from "./journeyActions";
import type { PipelineFailure } from "./pipelineTypes";
import type { TopicHint } from "./student";

const WITHIN_DAY_GAP_HOURS: [number, number] = [0.5, 3];
const ROUNDS_PER_CONVERSATION_RANGE: [number, number] = [2, 8];
const HOUR_MS = 60 * 60 * 1000;

export interface DayConversationsContext {
  repos: SimlabRepos;
  persona: Persona;
  llmConfig: LlmClientConfig;
  costGuard: CostGuard;
  log: SessionLogWriter;
  day: number;
  conversationsToday: number;
  nowIso: string;
  topicHint: TopicHint | undefined;
  random: ReturnType<typeof mulberry32>;
  telemetry?: RunTelemetry;
  onConversationComplete?: (
    repos: SimlabRepos,
    day: number,
    log: SessionLogWriter,
  ) => Promise<void>;
  touchedLabels: string[];
  newNodeLabels: string[];
  sightedNodeLabels: string[];
  rejectedCyclicEdges: RejectedCyclicEdge[];
  pipelineFailures: PipelineFailure[];
}

export interface DayConversationsOutcome {
  nowIso: string;
  topicHint: TopicHint | undefined;
  newNodeLabelsToday: string[];
  edgesAddedToday: number;
  edgesRejectedToday: number;
  conversationsRun: number;
  roundsRun: number;
}

export async function runJourneyDayConversations(
  ctx: DayConversationsContext,
): Promise<DayConversationsOutcome> {
  let nowIso = ctx.nowIso;
  let topicHint = ctx.topicHint;
  let edgesAddedToday = 0;
  let edgesRejectedToday = 0;
  let conversationsRun = 0;
  let roundsRun = 0;
  const newNodeLabelsToday: string[] = [];

  for (
    let conversationIndex = 0;
    conversationIndex < ctx.conversationsToday;
    conversationIndex += 1
  ) {
    if (conversationIndex > 0)
      nowIso = addHours(nowIso, randomFloat(ctx.random, ...WITHIN_DAY_GAP_HOURS));
    const conversationId = randomUUID();
    await ctx.repos.conversations.create({
      id: conversationId,
      title: `journey:${ctx.persona.name}:day${ctx.day}`,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const result = await runConversation({
      repos: ctx.repos,
      conversationId,
      persona: ctx.persona,
      llmConfig: ctx.llmConfig,
      costGuard: ctx.costGuard,
      log: ctx.log,
      day: ctx.day,
      maxRounds: randomInt(ctx.random, ...ROUNDS_PER_CONVERSATION_RANGE),
      startIso: nowIso,
      topicHint,
      telemetry: ctx.telemetry,
    });

    nowIso = result.endIso;
    conversationsRun += 1;
    roundsRun += result.rounds;
    ctx.newNodeLabels.push(...result.newNodeLabels);
    newNodeLabelsToday.push(...result.newNodeLabels);
    ctx.sightedNodeLabels.push(...result.sightedNodeLabels);
    ctx.touchedLabels.push(...result.newNodeLabels, ...result.sightedNodeLabels);
    ctx.rejectedCyclicEdges.push(...result.rejectedCyclicEdges);
    ctx.pipelineFailures.push(...result.pipelineFailures);
    edgesAddedToday += result.addedEdgeCount;
    edgesRejectedToday += result.rejectedCyclicEdges.length;

    if (ctx.onConversationComplete) await ctx.onConversationComplete(ctx.repos, ctx.day, ctx.log);

    const actionResult = await pickAndApplyJourneyAction({
      repos: ctx.repos,
      persona: ctx.persona,
      llmConfig: ctx.llmConfig,
      nowIso,
      random: ctx.random,
      recordCall: (purpose, model, usage) => {
        ctx.costGuard.recordCall(model, usage);
        ctx.telemetry?.ledger.recordSuccess(purpose);
      },
      recordFailure: (purpose) => ctx.telemetry?.ledger.recordFailure(purpose),
      logStage: (record) => ctx.log.writeLine({ event: "pipeline-stage", day: ctx.day, ...record }),
      touchedLabelsSoFar: ctx.touchedLabels,
    });
    topicHint = actionResult.topicHint;
    ctx.log.writeLine({
      event: "journey-action",
      day: ctx.day,
      action: actionResult.actionType,
      topicHint,
    });
  }

  return {
    nowIso,
    topicHint,
    newNodeLabelsToday,
    edgesAddedToday,
    edgesRejectedToday,
    conversationsRun,
    roundsRun,
  };
}

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR_MS).toISOString();
}
