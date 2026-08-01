/**
 * Purpose: shared types for the per-round pipeline stages (pipeline.ts and its three stage
 * modules) — the LLM/DB context every stage receives, and the structured failure/result
 * shapes T4's metrics aggregation consumes.
 * Main exports: PipelinePurpose, PipelineFailure, RoundPipelineInput, SightedNode.
 */
import type { LlmClientConfig, TokenUsage } from "@breadcrumb/core-llm";
import type { SimlabRepos } from "../db/repos";

export type PipelinePurpose = "knowledge-tree" | "knowledge-edges" | "interest";

export interface PipelineFailure {
  purpose: PipelinePurpose;
  error: string;
}

export interface SightedNode {
  nodeId: string;
  label: string;
}

export interface RoundPipelineInput {
  repos: SimlabRepos;
  conversationId: string;
  answerMessageId: string;
  userQuestion: string;
  assistantAnswer: string;
  nowIso: string;
  llmConfig: LlmClientConfig;
  recordCall: (purpose: PipelinePurpose, model: string, usage: TokenUsage) => void;
  logStage: (record: Record<string, unknown>) => void;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
