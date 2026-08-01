/**
 * Purpose: replays edgeStore.ts's edge-discovery pipeline stage in-process — candidate
 * ranking (embeddings or same-parent/recent fallback), edge-judge LLM call, cycle-safe
 * planning, and edge/method-node persistence. Mirrors that store's
 * extractEdgesFromFinishedRound() stage-for-stage.
 * Main exports: runEdgeJudgeStage, EdgeJudgeStageResult.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildEdgeJudgeMessages,
  type EdgeJudgeCandidatePair,
  edgeJudgeSchema,
  fallbackCandidatePairs,
  type JudgedPairContext,
  planEdgeJudgeResult,
  type RejectedCyclicEdge,
  rankCandidatePairs,
} from "@breadcrumb/plugin-graph";
import { describeError, type PipelineFailure, type RoundPipelineInput } from "./pipelineTypes";

const TOP_K_SIMILAR = 3;
const FALLBACK_RECENT_N = 5;

export interface EdgeJudgeStageResult {
  addedEdges: KnowledgeEdgeRow[];
  rejectedCyclicEdges: RejectedCyclicEdge[];
}

const EMPTY_RESULT: EdgeJudgeStageResult = { addedEdges: [], rejectedCyclicEdges: [] };

export async function runEdgeJudgeStage(
  input: RoundPipelineInput,
  newNodes: readonly KnowledgeNodeRow[],
  failures: PipelineFailure[],
): Promise<EdgeJudgeStageResult> {
  const newNodeIds = newNodes.map((node) => node.id);
  if (newNodeIds.length === 0) return EMPTY_RESULT;
  const { repos, llmConfig } = input;

  try {
    const [allNodes, embeddings, existingEdges] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.nodeEmbeddings.listAll(),
      repos.knowledgeEdges.listAll(),
    ]);
    const ranked = rankCandidatePairs(embeddings, newNodeIds, TOP_K_SIMILAR);
    const candidates =
      ranked.length > 0 ? ranked : fallbackCandidatePairs(allNodes, newNodeIds, FALLBACK_RECENT_N);
    if (candidates.length === 0) return EMPTY_RESULT;

    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const pairs = candidates
      .map((candidate, index) => {
        const nodeA = nodeById.get(candidate.newNodeId);
        const nodeB = nodeById.get(candidate.existingNodeId);
        if (nodeA === undefined || nodeB === undefined) return null;
        return { pairId: `p${index}`, nodeAId: nodeA.id, nodeBId: nodeB.id, nodeA, nodeB };
      })
      .filter(
        (pair): pair is JudgedPairContext & { nodeA: KnowledgeNodeRow; nodeB: KnowledgeNodeRow } =>
          pair !== null,
      );
    if (pairs.length === 0) return EMPTY_RESULT;

    const judgeCandidates: EdgeJudgeCandidatePair[] = pairs.map((pair) => ({
      pairId: pair.pairId,
      nodeALabel: pair.nodeA.label,
      nodeASummary: pair.nodeA.summary,
      nodeBLabel: pair.nodeB.label,
      nodeBSummary: pair.nodeB.summary,
    }));
    const messages = buildEdgeJudgeMessages(judgeCandidates);
    const { parsed, usage } = await chatJson(llmConfig, messages, edgeJudgeSchema);
    input.recordCall("knowledge-edges", llmConfig.model, usage);
    input.logStage({ purpose: "knowledge-edges", request: messages, response: parsed });

    const plan = planEdgeJudgeResult({
      judged: parsed,
      pairs,
      existingEdges,
      nodeIdByLabel: new Map(allNodes.map((node) => [node.label, node.id])),
      newId: () => randomUUID(),
      nowIso: () => input.nowIso,
    });
    for (const methodNode of plan.methodNodesToInsert)
      await repos.knowledgeNodes.insert(methodNode);
    for (const edge of plan.edgesToUpsert) await repos.knowledgeEdges.upsert(edge);
    if (plan.rejectedCyclicEdges.length > 0) {
      input.logStage({ purpose: "knowledge-edges", rejectedCyclicEdges: plan.rejectedCyclicEdges });
    }
    return { addedEdges: plan.edgesToUpsert, rejectedCyclicEdges: plan.rejectedCyclicEdges };
  } catch (error) {
    const message = describeError(error);
    failures.push({ purpose: "knowledge-edges", error: message });
    input.logStage({ purpose: "knowledge-edges", error: message });
    return EMPTY_RESULT;
  }
}
