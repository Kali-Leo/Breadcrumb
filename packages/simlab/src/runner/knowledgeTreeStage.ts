/**
 * Purpose: replays knowledgeStore.ts's extraction pipeline stage in-process — extraction LLM
 * call -> planNodeChanges -> node/sighting persistence -> synthetic embedding. Mirrors that
 * store's extractFromFinishedRound() stage-for-stage.
 * Main exports: runKnowledgeTreeStage, KnowledgeTreeStageResult.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildExtractionMessages,
  extractionResponseSchema,
  planNodeChanges,
} from "@breadcrumb/plugin-knowledge-tree";
import { embedNodes } from "../embedding/embedNodes";
import {
  describeError,
  type PipelineFailure,
  type RoundPipelineInput,
  type SightedNode,
} from "./pipelineTypes";

export interface KnowledgeTreeStageResult {
  newNodes: KnowledgeNodeRow[];
  sightings: SightedNode[];
}

export async function runKnowledgeTreeStage(
  input: RoundPipelineInput,
  failures: PipelineFailure[],
): Promise<KnowledgeTreeStageResult> {
  const {
    repos,
    conversationId,
    answerMessageId,
    userQuestion,
    assistantAnswer,
    nowIso,
    llmConfig,
  } = input;
  try {
    const existingNodes = await repos.knowledgeNodes.listAll();
    const messages = buildExtractionMessages(existingNodes, userQuestion, assistantAnswer);
    const { parsed, usage } = await chatJson(llmConfig, messages, extractionResponseSchema);
    input.recordCall("knowledge-tree", llmConfig.model, usage);
    input.logStage({ purpose: "knowledge-tree", request: messages, response: parsed });

    const plan = planNodeChanges({
      conversationId,
      sourceMessageId: answerMessageId,
      existingNodes,
      extracted: parsed.nodes,
      newId: () => randomUUID(),
      nowIso: () => nowIso,
    });
    for (const node of plan.newNodes) await repos.knowledgeNodes.insert(node);
    for (const sighting of plan.sightings) await repos.nodeSightings.record(sighting);
    await embedNodes(plan.newNodes, repos, nowIso);

    const labelById = new Map([
      ...existingNodes.map((node): [string, string] => [node.id, node.label]),
      ...plan.newNodes.map((node): [string, string] => [node.id, node.label]),
    ]);
    const sightings = plan.sightings.map((sighting) => ({
      nodeId: sighting.node_id,
      label: labelById.get(sighting.node_id) ?? sighting.node_id,
    }));
    return { newNodes: plan.newNodes, sightings };
  } catch (error) {
    const message = describeError(error);
    failures.push({ purpose: "knowledge-tree", error: message });
    input.logStage({ purpose: "knowledge-tree", error: message });
    return { newNodes: [], sightings: [] };
  }
}
