/**
 * Purpose: replays interestStore.ts's interest-extraction pipeline stage in-process — LLM
 * call over every node this round touched (new or re-sighted), then per-node signal
 * persistence. Mirrors that store's extractInterestFromRound() stage-for-stage.
 * Main exports: runInterestStage.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildInterestMessages,
  CONFIDENCE_LEVEL_SCORES,
  INTEREST_LEVEL_SCORES,
  type InterestExtractionNode,
  interestSignalsSchema,
} from "@breadcrumb/plugin-interest";
import {
  describeError,
  type PipelineFailure,
  type RoundPipelineInput,
  type SightedNode,
} from "./pipelineTypes";

/** Retries a fallible async call exactly once on failure (parse/network); rethrows the
 * second failure so the caller's existing catch/degrade path still handles it. */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

export async function runInterestStage(
  input: RoundPipelineInput,
  newNodes: readonly KnowledgeNodeRow[],
  sightings: readonly SightedNode[],
  failures: PipelineFailure[],
): Promise<void> {
  const touchedNodeIds = [
    ...new Set([
      ...newNodes.map((node) => node.id),
      ...sightings.map((sighting) => sighting.nodeId),
    ]),
  ];
  if (touchedNodeIds.length === 0) return;
  const { repos, conversationId, userQuestion, assistantAnswer, nowIso, llmConfig } = input;

  try {
    const allNodes = await repos.knowledgeNodes.listAll();
    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const touchedNodes: InterestExtractionNode[] = touchedNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is KnowledgeNodeRow => node !== undefined)
      .map((node) => ({ nodeId: node.id, label: node.label }));
    if (touchedNodes.length === 0) return;

    const messages = buildInterestMessages(touchedNodes, userQuestion, assistantAnswer);
    const { parsed, usage } = await retryOnce(() =>
      chatJson(llmConfig, messages, interestSignalsSchema),
    );
    input.recordCall("interest", llmConfig.model, usage);
    input.logStage({ purpose: "interest", request: messages, response: parsed });

    const nodeIdByLabel = new Map(touchedNodes.map((node) => [node.label, node.nodeId]));
    for (const signal of parsed.signals) {
      const nodeId = nodeIdByLabel.get(signal.label);
      if (nodeId === undefined) continue;
      await repos.interestSignals.insert({
        id: randomUUID(),
        node_id: nodeId,
        conversation_id: conversationId,
        curiosity: INTEREST_LEVEL_SCORES[signal.curiosity],
        confusion: INTEREST_LEVEL_SCORES[signal.confusion],
        boredom: INTEREST_LEVEL_SCORES[signal.boredom],
        confidence: CONFIDENCE_LEVEL_SCORES[signal.confidence],
        styles_json: JSON.stringify(signal.styles),
        created_at: nowIso,
      });
    }
  } catch (error) {
    const message = describeError(error);
    failures.push({ purpose: "interest", error: message });
    input.logStage({ purpose: "interest", error: message });
  }
}
