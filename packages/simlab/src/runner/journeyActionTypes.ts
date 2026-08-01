/**
 * Purpose: shared types for the between-conversation journey action modules
 * (journeyActions.ts, selfReportAction.ts, createGoalAction.ts) — split out purely to keep
 * each module under the file-size ceiling without a circular runtime import between them.
 * Main exports: JourneyActionType, JourneyActionResult, JourneyActionContext.
 */
import type { LlmClientConfig, TokenUsage } from "@breadcrumb/core-llm";
import type { SimlabRepos } from "../db/repos";
import type { Persona } from "../persona/schema";
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
  /** Self-reported knownTopics that had no matching tree node yet (mutated in place — same
   * Set instance threaded across the whole journey, see resolvePendingSelfReportTopics). */
  pendingSelfReportTopics: Set<string>;
}
