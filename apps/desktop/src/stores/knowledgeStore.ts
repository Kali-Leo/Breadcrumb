/**
 * Purpose: zustand store for the USER's global knowledge tree plus the active
 * conversation's trail (sightings), fresh-node highlighting, anchoring, and the
 * background extraction pipeline. Side effect on import: subscribes to the app bus.
 * Main exports: useKnowledgeStore.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildExtractionMessages,
  extractionResponseSchema,
  planNodeChanges,
} from "@breadcrumb/plugin-knowledge-tree";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { embedNodes } from "../lib/embeddings";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

interface KnowledgeState {
  /** The whole user tree (global — grows across conversations). */
  nodes: KnowledgeNodeRow[];
  /** Node ids this conversation walked past, in walking order (session trail). */
  sessionNodeIds: string[];
  freshNodeIds: ReadonlySet<string>;
  anchoredNodeId: string | null;
  loadTree(): Promise<void>;
  loadSessionTrail(conversationId: string | null): Promise<void>;
  toggleAnchor(nodeId: string): void;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  nodes: [],
  sessionNodeIds: [],
  freshNodeIds: new Set(),
  anchoredNodeId: null,

  async loadTree() {
    const repos = await getRepos();
    set({ nodes: await repos.knowledgeNodes.listAll() });
  },

  async loadSessionTrail(conversationId) {
    if (conversationId === null) {
      set({ sessionNodeIds: [], freshNodeIds: new Set(), anchoredNodeId: null });
      return;
    }
    const repos = await getRepos();
    const sightings = await repos.nodeSightings.listByConversation(conversationId);
    set({
      sessionNodeIds: [...new Set(sightings.map((sighting) => sighting.node_id))],
      freshNodeIds: new Set(),
      anchoredNodeId: null,
    });
  },

  toggleAnchor(nodeId) {
    set({ anchoredNodeId: get().anchoredNodeId === nodeId ? null : nodeId });
  },
}));

/** Extracts knowledge from the finished round; failures degrade silently (spec 002). */
async function extractFromFinishedRound(conversationId: string): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.knowledgeTree || !settings.networkEnabled || !settings.apiConfig) {
    return;
  }
  const chatMessages = useChatStore.getState().messages;
  const answer = chatMessages.at(-1);
  const question = chatMessages.at(-2);
  if (answer?.role !== "assistant" || question?.role !== "user") return;

  try {
    const repos = await getRepos();
    const existingNodes = await repos.knowledgeNodes.listAll();
    const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      buildExtractionMessages(existingNodes, question.content, answer.content),
      extractionResponseSchema,
    );
    await recordMeteredCall({
      purpose: "knowledge-tree",
      model: config.model,
      conversationId,
      usage,
    });

    const plan = planNodeChanges({
      conversationId,
      sourceMessageId: answer.id,
      existingNodes,
      extracted: parsed.nodes,
      newId,
      nowIso,
    });
    for (const node of plan.newNodes) {
      await repos.knowledgeNodes.insert(node);
    }
    for (const sighting of plan.sightings) {
      await repos.nodeSightings.record(sighting);
    }
    // Local, zero-cost, and best-effort: powers edge-candidate ranking later, never blocks chat.
    await embedNodes(plan.newNodes);

    const store = useKnowledgeStore.getState();
    const isViewingThisConversation =
      useChatStore.getState().activeConversationId === conversationId;
    useKnowledgeStore.setState({
      nodes: await repos.knowledgeNodes.listAll(),
      freshNodeIds: new Set(plan.newNodes.map((node) => node.id)),
      sessionNodeIds: isViewingThisConversation
        ? [
            ...store.sessionNodeIds,
            ...plan.sightings
              .map((sighting) => sighting.node_id)
              .filter((nodeId) => !store.sessionNodeIds.includes(nodeId)),
          ]
        : store.sessionNodeIds,
    });
    if (plan.sightings.length > 0 || plan.newNodes.length > 0) {
      appEventBus.emit("knowledge:nodesExtracted", {
        conversationId,
        freshNodeIds: plan.newNodes.map((node) => node.id),
        touchedNodeIds: plan.sightings.map((sighting) => sighting.node_id),
      });
    }
  } catch (error) {
    console.warn("knowledge extraction skipped:", error);
  }
}

appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void extractFromFinishedRound(conversationId);
});
