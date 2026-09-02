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
import type { JourneyLogWriter } from "./artifacts";
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
  log: JourneyLogWriter;
  day: number;
  conversationsToday: number;
  nowIso: string;
  topicHint: TopicHint | undefined;
  random: ReturnType<typeof mulberry32>;
  telemetry?: RunTelemetry;
  onConversationComplete?: (
    repos: SimlabRepos,
    day: number,
    log: JourneyLogWriter,
  ) => Promise<void>;
  touchedLabels: string[];
  newNodeLabels: string[];
  sightedNodeLabels: string[];
  rejectedCyclicEdges: RejectedCyclicEdge[];
  pipelineFailures: PipelineFailure[];
  /** Same Set instance for the whole journey — see resolvePendingSelfReportTopics. */
  pendingSelfReportTopics: Set<string>;
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
  context: DayConversationsContext,
): Promise<DayConversationsOutcome> {
  let nowIso = context.nowIso;
  let topicHint = context.topicHint;
  let edgesAddedToday = 0;
  let edgesRejectedToday = 0;
  let conversationsRun = 0;
  let roundsRun = 0;
  const newNodeLabelsToday: string[] = [];

  for (
    let conversationIndex = 0;
    conversationIndex < context.conversationsToday;
    conversationIndex += 1
  ) {
    if (conversationIndex > 0)
      nowIso = addHours(nowIso, randomFloat(context.random, ...WITHIN_DAY_GAP_HOURS));
    const conversationId = randomUUID();
    await context.repos.conversations.create({
      id: conversationId,
      title: `journey:${context.persona.name}:day${context.day}`,
      created_at: nowIso,
      updated_at: nowIso,
      kind: "chat",
    });

    const result = await runConversation({
      repos: context.repos,
      conversationId,
      persona: context.persona,
      llmConfig: context.llmConfig,
      costGuard: context.costGuard,
      log: context.log,
      day: context.day,
      maxRounds: randomInt(context.random, ...ROUNDS_PER_CONVERSATION_RANGE),
      startIso: nowIso,
      topicHint,
      telemetry: context.telemetry,
    });

    nowIso = result.endIso;
    conversationsRun += 1;
    roundsRun += result.rounds;
    context.newNodeLabels.push(...result.newNodeLabels);
    newNodeLabelsToday.push(...result.newNodeLabels);
    context.sightedNodeLabels.push(...result.sightedNodeLabels);
    context.touchedLabels.push(...result.newNodeLabels, ...result.sightedNodeLabels);
    context.rejectedCyclicEdges.push(...result.rejectedCyclicEdges);
    context.pipelineFailures.push(...result.pipelineFailures);
    edgesAddedToday += result.addedEdgeCount;
    edgesRejectedToday += result.rejectedCyclicEdges.length;

    if (context.onConversationComplete)
      await context.onConversationComplete(context.repos, context.day, context.log);

    const actionResult = await pickAndApplyJourneyAction({
      repos: context.repos,
      persona: context.persona,
      llmConfig: context.llmConfig,
      nowIso,
      random: context.random,
      recordCall: (purpose, model, usage) => {
        context.costGuard.recordCall(model, usage);
        context.telemetry?.ledger.recordSuccess(purpose);
      },
      recordFailure: (purpose) => context.telemetry?.ledger.recordFailure(purpose),
      logStage: (record) =>
        context.log.writeLine({ event: "pipeline-stage", day: context.day, ...record }),
      touchedLabelsSoFar: context.touchedLabels,
      pendingSelfReportTopics: context.pendingSelfReportTopics,
    });
    topicHint = actionResult.topicHint;
    context.log.writeLine({
      event: "journey-action",
      day: context.day,
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
