/**
 * Purpose: zustand store driving the knowledge-edge extraction pipeline — after
 * knowledge-tree extraction lands new nodes, ranks candidate pairs (embeddings or the
 * same-parent/recent fallback), asks the LLM to judge requires/helps relationships, and
 * persists the cycle-safe result. Side effect on import: subscribes to the app bus on
 * knowledge:nodesExtracted — fired only after new nodes AND their embeddings have landed,
 * so no timer race against the tree-extraction pipeline. Candidates are judged in chunks of
 * EDGE_JUDGE_BATCH_SIZE because edgeJudgeSchema caps a reply at 20 verdicts while ranking can
 * hand over 40 pairs — sending them all at once made the model silently truncate (design
 * audit 2026-08-28 #4).
 * Main exports: useEdgeStore.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import { chunkPairs } from "@breadcrumb/plugin-compare";
import {
  buildEdgeJudgeMessages,
  DEFAULT_FALLBACK_RECENT_N,
  DEFAULT_TOP_K_SIMILAR,
  type EdgeJudgeCandidatePair,
  edgeJudgeSchema,
  fallbackCandidatePairs,
  type JudgedPairContext,
  planEdgeJudgeResult,
  rankCandidatePairs,
} from "@breadcrumb/plugin-graph";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { llmConfigFrom } from "../lib/llmConfig";
import { recordFailedCallUsage, recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useSettingsStore } from "./settingsStore";

/** Pairs per edge-judge call. Must not exceed edgeJudgeSchema.edges' own .max(20): the
 * schema is the model's contract, and a batch larger than it can only come back truncated. */
const EDGE_JUDGE_BATCH_SIZE = 20;

interface EdgeState {
  /** Edge ids added by the most recent extraction round, for lightweight UI feedback. */
  lastAddedEdgeIds: string[];
}

export const useEdgeStore = create<EdgeState>(() => ({
  lastAddedEdgeIds: [],
}));

interface PairWithNodes extends JudgedPairContext {
  nodeA: KnowledgeNodeRow;
  nodeB: KnowledgeNodeRow;
}

/** Resolves candidate node-id pairs to full node rows, tagging each with a stable pairId
 * the model echoes back. Pairs whose node was deleted between listing and here are dropped. */
function attachNodes(
  candidates: readonly { newNodeId: string; existingNodeId: string }[],
  nodeById: ReadonlyMap<string, KnowledgeNodeRow>,
): PairWithNodes[] {
  return candidates
    .map((candidate, index) => {
      const nodeA = nodeById.get(candidate.newNodeId);
      const nodeB = nodeById.get(candidate.existingNodeId);
      if (nodeA === undefined || nodeB === undefined) return null;
      return { pairId: `p${index}`, nodeAId: nodeA.id, nodeBId: nodeB.id, nodeA, nodeB };
    })
    .filter((entry): entry is PairWithNodes => entry !== null);
}

/** Discovers requires/helps edges for this round's newly-learned nodes; failures degrade
 * silently (spec 010) — the chat and knowledge-tree pipelines are never affected. */
async function extractEdgesFromFinishedRound(
  conversationId: string,
  newNodeIds: readonly string[],
  sourceMessageId: string,
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.knowledgeEdges || !settings.networkEnabled || !settings.apiConfig) {
    return;
  }
  if (newNodeIds.length === 0) return;

  try {
    const repos = await getRepos();
    const [allNodes, embeddings, existingEdges] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.nodeEmbeddings.listAll(),
      repos.knowledgeEdges.listAll(),
    ]);

    const ranked = rankCandidatePairs(embeddings, newNodeIds, DEFAULT_TOP_K_SIMILAR);
    const candidates =
      ranked.length > 0
        ? ranked
        : fallbackCandidatePairs(allNodes, newNodeIds, DEFAULT_FALLBACK_RECENT_N);
    if (candidates.length === 0) return;

    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const pairs = attachNodes(candidates, nodeById);
    if (pairs.length === 0) return;

    const config = llmConfigFrom(settings.apiConfig);
    const addedEdges: KnowledgeEdgeRow[] = [];
    let insertedNodeCount = 0;
    // Edges accumulate across chunks so a later chunk's cycle guard sees what an earlier one
    // accepted, exactly as it would have inside one oversized call.
    let workingEdges: KnowledgeEdgeRow[] = [...existingEdges];
    let nodeIdByLabel = new Map(allNodes.map((node) => [node.label, node.id]));

    for (const batch of chunkPairs(pairs, EDGE_JUDGE_BATCH_SIZE)) {
      const judgeCandidates: EdgeJudgeCandidatePair[] = batch.map((pair) => ({
        pairId: pair.pairId,
        nodeALabel: pair.nodeA.label,
        nodeASummary: pair.nodeA.summary,
        nodeBLabel: pair.nodeB.label,
        nodeBSummary: pair.nodeB.summary,
      }));
      const { parsed, usage } = await chatJson(
        config,
        buildEdgeJudgeMessages(judgeCandidates, { casual: settings.learningMode === "casual" }),
        edgeJudgeSchema,
      );
      await recordMeteredCall({
        purpose: "knowledge-edges",
        model: config.model,
        conversationId,
        usage,
      });

      const plan = planEdgeJudgeResult({
        judged: parsed,
        pairs: batch,
        existingEdges: workingEdges,
        nodeIdByLabel,
        sourceMessageId,
        newId,
        nowIso,
      });

      for (const rejected of plan.rejectedCyclicEdges) {
        console.warn(
          "knowledge-edges: dropped a requires edge that would create a cycle",
          rejected,
        );
      }
      for (const methodNode of [...plan.methodNodesToInsert, ...plan.conceptNodesToInsert]) {
        // Casual-mode adjacent-concept nodes (spec 016) are inserted WITHOUT a node_sightings
        // row, so they stay genuinely unlit — that's what gives frontier() a real "ahead".
        await repos.knowledgeNodes.insert(methodNode);
        nodeIdByLabel = new Map(nodeIdByLabel).set(methodNode.label, methodNode.id);
        insertedNodeCount += 1;
      }
      for (const edge of plan.edgesToUpsert) {
        await repos.knowledgeEdges.upsert(edge);
        addedEdges.push(edge);
      }
      workingEdges = [...workingEdges, ...plan.edgesToUpsert];
    }

    if (addedEdges.length > 0 || insertedNodeCount > 0) {
      if (insertedNodeCount > 0) {
        useKnowledgeStore.setState({ nodes: await repos.knowledgeNodes.listAll() });
      }
      const addedEdgeIds = addedEdges.map((edge) => edge.id);
      useEdgeStore.setState({ lastAddedEdgeIds: addedEdgeIds });
      appEventBus.emit("knowledge:edgesUpdated", { addedEdgeIds });
    }
  } catch (error) {
    console.warn("knowledge-edge extraction skipped:", error);
    void recordAiFailure("knowledge-edges", error);
    void recordFailedCallUsage(error, {
      purpose: "knowledge-edges",
      model: settings.apiConfig.model,
      conversationId,
    });
  }
}

appEventBus.on("knowledge:nodesExtracted", ({ conversationId, freshNodeIds, sourceMessageId }) => {
  void extractEdgesFromFinishedRound(conversationId, freshNodeIds, sourceMessageId);
});
