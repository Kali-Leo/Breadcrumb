/**
 * Purpose: replays knowledgeStore.ts's extraction pipeline stage in-process — extraction LLM
 * call -> planNodeChanges -> spec-015 synonym gate -> node/sighting/alias persistence ->
 * synthetic embedding. Mirrors that store's extractFromFinishedRound() stage-for-stage.
 * Main exports: runKnowledgeTreeStage, KnowledgeTreeStageResult.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildExtractionMessages,
  extractionResponseSchema,
  planNodeChanges,
} from "@breadcrumb/feature-knowledge-tree";
import { embedNodes } from "../embedding/embedNodes";
import {
  describeError,
  type PipelineFailure,
  type RoundPipelineInput,
  type SightedNode,
} from "./pipelineTypes";
import { runSynonymGateStage } from "./synonymGateStage";

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
    const aliases = await repos.nodeAliases.listAll();
    const aliasNodeIdByLabel = new Map(aliases.map((alias) => [alias.alias_label, alias.node_id]));
    const messages = buildExtractionMessages(existingNodes, userQuestion, assistantAnswer);
    const { parsed, usage } = await chatJson(llmConfig, messages, extractionResponseSchema);
    input.recordCall("knowledge-tree", llmConfig.model, usage);
    input.logStage({ purpose: "knowledge-tree", request: messages, response: parsed });

    const rawPlan = planNodeChanges({
      conversationId,
      sourceMessageId: answerMessageId,
      existingNodes,
      extracted: parsed.nodes,
      aliasNodeIdByLabel,
      newId: () => randomUUID(),
      nowIso: () => nowIso,
    });
    // Node-dedup gate (spec 015) — strictly between planNodeChanges and insert, mirroring
    // knowledgeStore.ts's wiring.
    const plan = await runSynonymGateStage(input, rawPlan, existingNodes, failures);

    for (const node of plan.newNodes) await repos.knowledgeNodes.insert(node);
    for (const sighting of plan.sightings) await repos.nodeSightings.record(sighting);
    for (const alias of plan.aliasesToInsert) await repos.nodeAliases.insert(alias);
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
