/**
 * Purpose: zustand store for the knowledge tree — nodes of the active conversation,
 * fresh-node highlighting, anchoring, and the background extraction pipeline that
 * listens to chat:responseFinished. Side effect on import: subscribes to the app bus.
 * Main exports: useKnowledgeStore.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildExtractionMessages,
  extractionResponseSchema,
  planNodeInserts,
} from "@breadcrumb/plugin-knowledge-tree";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

interface KnowledgeState {
  nodes: KnowledgeNodeRow[];
  freshNodeIds: ReadonlySet<string>;
  anchoredNodeId: string | null;
  loadForConversation(conversationId: string | null): Promise<void>;
  toggleAnchor(nodeId: string): void;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  nodes: [],
  freshNodeIds: new Set(),
  anchoredNodeId: null,

  async loadForConversation(conversationId) {
    if (conversationId === null) {
      set({ nodes: [], freshNodeIds: new Set(), anchoredNodeId: null });
      return;
    }
    const repos = await getRepos();
    const nodes = await repos.knowledgeNodes.listByConversation(conversationId);
    set({ nodes, freshNodeIds: new Set(), anchoredNodeId: null });
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
    const existingNodes = await repos.knowledgeNodes.listByConversation(conversationId);
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

    const rows = planNodeInserts({
      conversationId,
      sourceMessageId: answer.id,
      existingNodes,
      extracted: parsed.nodes,
      newId,
      nowIso,
    });
    for (const row of rows) {
      await repos.knowledgeNodes.insert(row);
    }
    if (useChatStore.getState().activeConversationId === conversationId) {
      const nodes = await repos.knowledgeNodes.listByConversation(conversationId);
      useKnowledgeStore.setState({ nodes, freshNodeIds: new Set(rows.map((row) => row.id)) });
    }
  } catch (error) {
    console.warn("knowledge extraction skipped:", error);
  }
}

appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void extractFromFinishedRound(conversationId);
});
