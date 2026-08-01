/**
 * Purpose: runs one full journey — one persona living V virtual days in a single temp
 * database, 0-3 conversations per day (2-8 rounds each), with realistic within-day and
 * cross-day clock jumps (forgetting happens for real) and PRNG-driven journey actions
 * between conversations (follow-frontier/self-report/create-goal/revisit/jump-domain).
 * Logs every turn, pipeline call and day digest to a JSONL file (the artifacts contract).
 * Main exports: runJourney, JourneyOptions, JourneyResult.
 */
import { randomUUID } from "node:crypto";
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import type { RejectedCyclicEdge } from "@breadcrumb/plugin-graph";
import type { SimlabRepos } from "../db/repos";
import { createTempDatabase } from "../db/sqliteClient";
import type { Persona } from "../persona/schema";
import { mulberry32, randomFloat, randomInt, seedFromStrings } from "../util/prng";
import type { SessionLogWriter } from "./artifacts";
import { runConversation } from "./conversation";
import type { CostGuard } from "./costGuard";
import { computeDayDigest, type DayDigest } from "./dayDigest";
import { pickAndApplyJourneyAction } from "./journeyActions";
import type { PipelineFailure } from "./pipelineTypes";
import type { TopicHint } from "./student";

const HOUR_MS = 60 * 60 * 1000;
/** Gaps between same-day conversations, and between the last conversation of one day and
 * the first of the next — tunable constants, not spec-mandated exact numbers except the
 * cross-day range (16-40h), which IS spec-mandated (forgetting must happen for real). */
const WITHIN_DAY_GAP_HOURS: [number, number] = [0.5, 3];
const CROSS_DAY_GAP_HOURS: [number, number] = [16, 40];
const CONVERSATIONS_PER_DAY_RANGE: [number, number] = [0, 3];
const ROUNDS_PER_CONVERSATION_RANGE: [number, number] = [2, 8];

export interface JourneyOptions {
  persona: Persona;
  journeyIndex: number;
  days: number;
  llmConfig: LlmClientConfig;
  costGuard: CostGuard;
  log: SessionLogWriter;
  startIso?: string;
  /** T4 hook: run mechanical tripwires against the still-open db after each conversation. */
  onConversationComplete?: (
    repos: SimlabRepos,
    day: number,
    log: SessionLogWriter,
  ) => Promise<void>;
}

export interface JourneyResult {
  journeyId: string;
  personaId: string;
  days: number;
  totalConversations: number;
  totalRounds: number;
  newNodeLabels: string[];
  sightedNodeLabels: string[];
  rejectedCyclicEdges: RejectedCyclicEdge[];
  pipelineFailures: PipelineFailure[];
  totalCostCny: number;
  dbPath: string;
  dayDigests: DayDigest[];
}

export async function runJourney(options: JourneyOptions): Promise<JourneyResult> {
  const { persona, journeyIndex, days, llmConfig, costGuard, log } = options;
  const startIso = options.startIso ?? new Date().toISOString();
  const random = mulberry32(seedFromStrings([persona.id, String(journeyIndex)]));

  const temp = await createTempDatabase();
  const journeyId = `j${journeyIndex}-${randomUUID()}`;
  log.writeLine({ event: "journey-start", journeyId, personaId: persona.id, days, startIso });

  let nowIso = startIso;
  let topicHint: TopicHint | undefined;
  const touchedLabels: string[] = [];
  const newNodeLabels: string[] = [];
  const sightedNodeLabels: string[] = [];
  const rejectedCyclicEdges: RejectedCyclicEdge[] = [];
  const pipelineFailures: PipelineFailure[] = [];
  const dayDigests: DayDigest[] = [];
  let previousMasteryByNode = new Map<string, number>();
  let totalConversations = 0;
  let totalRounds = 0;

  for (let day = 0; day < days; day += 1) {
    const conversationsToday = randomInt(random, ...CONVERSATIONS_PER_DAY_RANGE);
    let edgesAddedToday = 0;
    let edgesRejectedToday = 0;
    const newNodeLabelsToday: string[] = [];

    for (
      let conversationIndex = 0;
      conversationIndex < conversationsToday;
      conversationIndex += 1
    ) {
      if (conversationIndex > 0) {
        nowIso = addHours(nowIso, randomFloat(random, ...WITHIN_DAY_GAP_HOURS));
      }
      const conversationId = randomUUID();
      await temp.repos.conversations.create({
        id: conversationId,
        title: `journey:${persona.name}:day${day}`,
        created_at: nowIso,
        updated_at: nowIso,
      });

      const result = await runConversation({
        repos: temp.repos,
        conversationId,
        persona,
        llmConfig,
        costGuard,
        log,
        day,
        maxRounds: randomInt(random, ...ROUNDS_PER_CONVERSATION_RANGE),
        startIso: nowIso,
        topicHint,
      });

      nowIso = result.endIso;
      totalConversations += 1;
      totalRounds += result.rounds;
      newNodeLabels.push(...result.newNodeLabels);
      newNodeLabelsToday.push(...result.newNodeLabels);
      sightedNodeLabels.push(...result.sightedNodeLabels);
      touchedLabels.push(...result.newNodeLabels, ...result.sightedNodeLabels);
      rejectedCyclicEdges.push(...result.rejectedCyclicEdges);
      pipelineFailures.push(...result.pipelineFailures);
      edgesAddedToday += result.addedEdgeCount;
      edgesRejectedToday += result.rejectedCyclicEdges.length;

      if (options.onConversationComplete) {
        await options.onConversationComplete(temp.repos, day, log);
      }

      const actionResult = await pickAndApplyJourneyAction({
        repos: temp.repos,
        persona,
        llmConfig,
        nowIso,
        random,
        recordCall: (_purpose, model, usage) => costGuard.recordCall(model, usage),
        logStage: (record) => log.writeLine({ event: "pipeline-stage", day, ...record }),
        touchedLabelsSoFar: touchedLabels,
      });
      topicHint = actionResult.topicHint;
      log.writeLine({ event: "journey-action", day, action: actionResult.actionType, topicHint });
    }

    const dayOutcome = await computeDayDigest(
      temp.repos,
      day,
      nowIso,
      newNodeLabelsToday,
      edgesAddedToday,
      edgesRejectedToday,
      previousMasteryByNode,
    );
    dayDigests.push(dayOutcome.digest);
    log.writeLine({ event: "day-digest", day, digest: dayOutcome.digest });
    previousMasteryByNode = dayOutcome.masteryByNode;

    if (day < days - 1) {
      nowIso = addHours(nowIso, randomFloat(random, ...CROSS_DAY_GAP_HOURS));
    }
  }

  log.writeLine({ event: "journey-end", journeyId, days, totalConversations, totalRounds });
  const dbPath = temp.path;
  temp.close();

  return {
    journeyId,
    personaId: persona.id,
    days,
    totalConversations,
    totalRounds,
    newNodeLabels,
    sightedNodeLabels,
    rejectedCyclicEdges,
    pipelineFailures,
    totalCostCny: costGuard.totalCny(),
    dbPath,
    dayDigests,
  };
}

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR_MS).toISOString();
}
