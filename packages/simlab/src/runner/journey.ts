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
import type { RunTelemetry } from "../judges/telemetry";
import type { Persona } from "../persona/schema";
import { mulberry32, randomFloat, randomInt, seedFromStrings } from "../util/prng";
import type { JourneyLogWriter } from "./artifacts";
import type { CostGuard } from "./costGuard";
import { computeDayDigest, type DayDigest } from "./dayDigest";
import { runJourneyDayConversations } from "./journeyDay";
import type { PipelineFailure } from "./pipelineTypes";
import type { TopicHint } from "./student";
import { runTrailSummaryStage } from "./trailSummaryStage";

const HOUR_MS = 60 * 60 * 1000;
/** Gap between the last conversation of one day and the first of the next — spec-mandated
 * (forgetting must happen for real); within-day gaps and rounds-per-conversation ranges live
 * in journeyDay.ts alongside the conversation loop they govern. */
const CROSS_DAY_GAP_HOURS: [number, number] = [16, 40];
const CONVERSATIONS_PER_DAY_RANGE: [number, number] = [0, 3];

export interface JourneyOptions {
  persona: Persona;
  journeyIndex: number;
  days: number;
  llmConfig: LlmClientConfig;
  costGuard: CostGuard;
  log: JourneyLogWriter;
  startIso?: string;
  /** T4 hook: run mechanical tripwires against the still-open db after each conversation. */
  onConversationComplete?: (
    repos: SimlabRepos,
    day: number,
    log: JourneyLogWriter,
  ) => Promise<void>;
  /** T4 telemetry: per-purpose call ledger + pressure-lexicon scan, threaded through every
   * LLM call the journey makes (round pipeline, journey actions, daily trail summary). */
  telemetry?: RunTelemetry;
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
    const dayOutcome = await runJourneyDayConversations({
      repos: temp.repos,
      persona,
      llmConfig,
      costGuard,
      log,
      day,
      conversationsToday: randomInt(random, ...CONVERSATIONS_PER_DAY_RANGE),
      nowIso,
      topicHint,
      random,
      telemetry: options.telemetry,
      onConversationComplete: options.onConversationComplete,
      touchedLabels,
      newNodeLabels,
      sightedNodeLabels,
      rejectedCyclicEdges,
      pipelineFailures,
    });
    nowIso = dayOutcome.nowIso;
    topicHint = dayOutcome.topicHint;
    totalConversations += dayOutcome.conversationsRun;
    totalRounds += dayOutcome.roundsRun;

    if (dayOutcome.newNodeLabelsToday.length > 0) {
      const newLabelSet = new Set(dayOutcome.newNodeLabelsToday);
      const allNodes = await temp.repos.knowledgeNodes.listAll();
      await runTrailSummaryStage({
        day,
        nodesLearnedToday: allNodes.filter((node) => newLabelSet.has(node.label)),
        llmConfig,
        telemetry: options.telemetry,
        logStage: (record) => log.writeLine({ event: "pipeline-stage", day, ...record }),
        recordCall: (model, usage) => costGuard.recordCall(model, usage),
      });
    }

    const digestOutcome = await computeDayDigest(
      temp.repos,
      day,
      nowIso,
      dayOutcome.newNodeLabelsToday,
      dayOutcome.edgesAddedToday,
      dayOutcome.edgesRejectedToday,
      previousMasteryByNode,
    );
    dayDigests.push(digestOutcome.digest);
    log.writeLine({ event: "day-digest", day, digest: digestOutcome.digest });
    previousMasteryByNode = digestOutcome.masteryByNode;

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
