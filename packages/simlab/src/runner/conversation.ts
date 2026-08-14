/**
 * Purpose: runs one conversation (a bounded run of student<->tutor rounds within a journey's
 * single day) against an already-open journey database — student turn, tutor turn, then the
 * real per-round pipeline, advancing a small per-round clock step. A journey strings many of
 * these together across many virtual days (see journey.ts).
 * Main exports: runConversation, ConversationOptions, ConversationResult.
 */
import { randomUUID } from "node:crypto";
import type { ChatMessage, LlmClientConfig } from "@breadcrumb/core-llm";
import type { RejectedCyclicEdge } from "@breadcrumb/plugin-graph";
import type { SimlabRepos } from "../db/repos";
import { findPressureLexiconHits } from "../judges/pressureLexicon";
import { checkTeachingDiscipline } from "../judges/teachingDiscipline";
import type { RunTelemetry } from "../judges/telemetry";
import type { Persona } from "../persona/schema";
import type { JourneyLogWriter } from "./artifacts";
import { logTopicHintMismatchIfAny, withEmptyRetry } from "./conversationGuards";
import type { CostGuard } from "./costGuard";
import { runRoundPipeline } from "./pipeline";
import type { PipelineFailure } from "./pipelineTypes";
import { getStudentReply, type TopicHint } from "./student";
import { getTutorReply } from "./tutor";

/** Time between adjacent messages within one conversation — a single sitting, not a gap. */
export const ROUND_STEP_MS = 60_000;

export type ConversationStopReason = "stop-token" | "max-rounds" | "degenerate-turn";

export interface ConversationOptions {
  repos: SimlabRepos;
  conversationId: string;
  persona: Persona;
  llmConfig: LlmClientConfig;
  costGuard: CostGuard;
  log: JourneyLogWriter;
  day: number;
  maxRounds: number;
  startIso: string;
  topicHint?: TopicHint;
  telemetry?: RunTelemetry;
}

export interface ConversationResult {
  rounds: number;
  stopReason: ConversationStopReason;
  endIso: string;
  newNodeLabels: string[];
  sightedNodeLabels: string[];
  addedEdgeCount: number;
  rejectedCyclicEdges: RejectedCyclicEdge[];
  pipelineFailures: PipelineFailure[];
}

export async function runConversation(options: ConversationOptions): Promise<ConversationResult> {
  const { repos, conversationId, persona, llmConfig, costGuard, log, day, maxRounds } = options;
  const transcript: ChatMessage[] = [];
  const newNodeLabels: string[] = [];
  const sightedNodeLabels: string[] = [];
  const rejectedCyclicEdges: RejectedCyclicEdge[] = [];
  const pipelineFailures: PipelineFailure[] = [];
  let addedEdgeCount = 0;
  let stopReason: ConversationStopReason = "max-rounds";
  let nowIso = options.startIso;
  let round = 0;

  for (; round < maxRounds; round += 1) {
    const studentReply = await withEmptyRetry(() =>
      getStudentReply(llmConfig, persona, transcript, round === 0 ? options.topicHint : undefined),
    );
    costGuard.recordCall(llmConfig.model, studentReply.usage);
    if (studentReply.content.trim() === "") {
      log.writeLine({ event: "degenerate-turn", day, conversationId, round, source: "student" });
      stopReason = "degenerate-turn";
      break;
    }
    log.writeLine({
      event: "student-turn",
      day,
      conversationId,
      round,
      content: studentReply.content,
      usage: studentReply.usage,
    });
    if (round === 0) {
      logTopicHintMismatchIfAny(log, options.topicHint, studentReply.content, {
        day,
        conversationId,
        round,
      });
    }
    if (studentReply.isStop) {
      stopReason = "stop-token";
      break;
    }

    nowIso = new Date(Date.parse(nowIso) + ROUND_STEP_MS).toISOString();
    const studentMessageId = randomUUID();
    await repos.messages.append({
      id: studentMessageId,
      conversation_id: conversationId,
      role: "user",
      content: studentReply.content,
      created_at: nowIso,
      teaching_mode: null,
      parent_id: null,
    });
    transcript.push({ role: "user", content: studentReply.content });

    const tutorReply = await withEmptyRetry(() => getTutorReply(llmConfig, transcript));
    costGuard.recordCall(llmConfig.model, tutorReply.usage);
    if (tutorReply.content.trim() === "") {
      log.writeLine({ event: "degenerate-turn", day, conversationId, round, source: "tutor" });
      stopReason = "degenerate-turn";
      break;
    }
    log.writeLine({
      event: "tutor-turn",
      day,
      conversationId,
      round,
      content: tutorReply.content,
      usage: tutorReply.usage,
    });
    if (options.telemetry) {
      const hits = findPressureLexiconHits(tutorReply.content, options.telemetry.pressureLexicon);
      if (hits.length > 0) {
        options.telemetry.onPressureHit({
          source: "tutor",
          day,
          conversationId,
          round,
          text: tutorReply.content,
          hits,
        });
      }
      options.telemetry.onTeachingDisciplineCheck(checkTeachingDiscipline([tutorReply.content]));
    }

    nowIso = new Date(Date.parse(nowIso) + ROUND_STEP_MS).toISOString();
    const tutorMessageId = randomUUID();
    await repos.messages.append({
      id: tutorMessageId,
      conversation_id: conversationId,
      role: "assistant",
      content: tutorReply.content,
      created_at: nowIso,
      teaching_mode: null,
      parent_id: null,
    });
    transcript.push({ role: "assistant", content: tutorReply.content });

    const pipelineResult = await runRoundPipeline({
      repos,
      conversationId,
      answerMessageId: tutorMessageId,
      userQuestion: studentReply.content,
      assistantAnswer: tutorReply.content,
      nowIso,
      llmConfig,
      recordCall: (purpose, model, usage) => {
        costGuard.recordCall(model, usage);
        options.telemetry?.ledger.recordSuccess(purpose);
      },
      logStage: (record) =>
        log.writeLine({ event: "pipeline-stage", day, conversationId, round, ...record }),
    });
    newNodeLabels.push(...pipelineResult.newNodes.map((node) => node.label));
    sightedNodeLabels.push(...pipelineResult.sightings.map((sighting) => sighting.label));
    addedEdgeCount += pipelineResult.addedEdges.length;
    rejectedCyclicEdges.push(...pipelineResult.rejectedCyclicEdges);
    pipelineFailures.push(...pipelineResult.failures);
    for (const failure of pipelineResult.failures) {
      options.telemetry?.ledger.recordFailure(failure.purpose);
    }
  }

  return {
    rounds: round,
    stopReason,
    endIso: nowIso,
    newNodeLabels,
    sightedNodeLabels,
    addedEdgeCount,
    rejectedCyclicEdges,
    pipelineFailures,
  };
}
