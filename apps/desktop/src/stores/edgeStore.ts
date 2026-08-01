/**
 * Purpose: zustand store driving the knowledge-edge extraction pipeline — after
 * knowledge-tree extraction lands new nodes, ranks candidate pairs (embeddings or the
 * same-parent/recent fallback), asks the LLM to judge requires/helps relationships, and
 * persists the cycle-safe result. Side effect on import: subscribes to the app bus on
 * knowledge:nodesExtracted — fired only after new nodes AND their embeddings have landed,
 * so no timer race against the tree-extraction pipeline.
 * Main exports: useEdgeStore.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildEdgeJudgeMessages,
  type EdgeJudgeCandidatePair,
  edgeJudgeSchema,
  fallbackCandidatePairs,
  type JudgedPairContext,
  planEdgeJudgeResult,
  rankCandidatePairs,
} from "@breadcrumb/plugin-graph";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useSettingsStore } from "./settingsStore";

const TOP_K_SIMILAR = 3;
const FALLBACK_RECENT_N = 5;

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

    const ranked = rankCandidatePairs(embeddings, newNodeIds, TOP_K_SIMILAR);
    const candidates =
      ranked.length > 0 ? ranked : fallbackCandidatePairs(allNodes, newNodeIds, FALLBACK_RECENT_N);
    if (candidates.length === 0) return;

    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const pairs = attachNodes(candidates, nodeById);
    if (pairs.length === 0) return;

    const judgeCandidates: EdgeJudgeCandidatePair[] = pairs.map((pair) => ({
      pairId: pair.pairId,
      nodeALabel: pair.nodeA.label,
      nodeASummary: pair.nodeA.summary,
      nodeBLabel: pair.nodeB.label,
      nodeBSummary: pair.nodeB.summary,
    }));

    const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      buildEdgeJudgeMessages(judgeCandidates),
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
      pairs,
      existingEdges,
      nodeIdByLabel: new Map(allNodes.map((node) => [node.label, node.id])),
      newId,
      nowIso,
    });

    for (const rejected of plan.rejectedCyclicEdges) {
      console.warn("knowledge-edges: dropped a requires edge that would create a cycle", rejected);
    }
    for (const methodNode of plan.methodNodesToInsert) {
      await repos.knowledgeNodes.insert(methodNode);
    }
    const addedEdges: KnowledgeEdgeRow[] = [];
    for (const edge of plan.edgesToUpsert) {
      await repos.knowledgeEdges.upsert(edge);
      addedEdges.push(edge);
    }

    if (addedEdges.length > 0 || plan.methodNodesToInsert.length > 0) {
      if (plan.methodNodesToInsert.length > 0) {
        useKnowledgeStore.setState({ nodes: await repos.knowledgeNodes.listAll() });
      }
      const addedEdgeIds = addedEdges.map((edge) => edge.id);
      useEdgeStore.setState({ lastAddedEdgeIds: addedEdgeIds });
      appEventBus.emit("knowledge:edgesUpdated", { addedEdgeIds });
    }
  } catch (error) {
    console.warn("knowledge-edge extraction skipped:", error);
  }
}

appEventBus.on("knowledge:nodesExtracted", ({ conversationId, freshNodeIds }) => {
  void extractEdgesFromFinishedRound(conversationId, freshNodeIds);
});
