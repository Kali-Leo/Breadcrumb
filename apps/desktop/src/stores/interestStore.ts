/**
 * Purpose: zustand store driving the interest-signal extraction pipeline. Side effect on
 * import: subscribes to the app bus on knowledge:nodesExtracted, reacting to every touched
 * node (new or re-sighted), not just fresh ones.
 * Main exports: useInterestStore.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildInterestMessages,
  type InterestExtractionNode,
  interestSignalsSchema,
} from "@breadcrumb/plugin-interest";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

interface InterestState {
  /** Node ids the most recent interest-extraction round wrote a signal for. */
  lastSignalNodeIds: string[];
}

export const useInterestStore = create<InterestState>(() => ({
  lastSignalNodeIds: [],
}));

/** Extracts interest signals for every node this round touched; failures degrade silently
 * (spec 011) — chat and the other extraction pipelines are never affected. */
async function extractInterestFromRound(
  conversationId: string,
  touchedNodeIds: readonly string[],
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.interest || !settings.networkEnabled || !settings.apiConfig) {
    return;
  }
  if (touchedNodeIds.length === 0) return;

  try {
    const repos = await getRepos();
    const [allNodes, messages] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.messages.listByConversation(conversationId),
    ]);
    const answer = messages.at(-1);
    const question = messages.at(-2);
    if (answer?.role !== "assistant" || question?.role !== "user") return;

    const nodeById = new Map(allNodes.map((node) => [node.id, node]));
    const touchedNodes: InterestExtractionNode[] = touchedNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is KnowledgeNodeRow => node !== undefined)
      .map((node) => ({ nodeId: node.id, label: node.label }));
    if (touchedNodes.length === 0) return;

    const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      buildInterestMessages(touchedNodes, question.content, answer.content),
      interestSignalsSchema,
    );
    await recordMeteredCall({ purpose: "interest", model: config.model, conversationId, usage });

    const nodeIdByLabel = new Map(touchedNodes.map((node) => [node.label, node.nodeId]));
    const createdAt = nowIso();
    const signalNodeIds: string[] = [];
    for (const signal of parsed.signals) {
      const nodeId = nodeIdByLabel.get(signal.label);
      if (nodeId === undefined) continue;
      await repos.interestSignals.insert({
        id: newId(),
        node_id: nodeId,
        conversation_id: conversationId,
        curiosity: signal.curiosity,
        confusion: signal.confusion,
        boredom: signal.boredom,
        styles_json: JSON.stringify(signal.styles),
        created_at: createdAt,
      });
      signalNodeIds.push(nodeId);
    }

    if (signalNodeIds.length > 0) {
      useInterestStore.setState({ lastSignalNodeIds: signalNodeIds });
      appEventBus.emit("interest:updated", { nodeIds: signalNodeIds });
    }
  } catch (error) {
    console.warn("interest extraction skipped:", error);
  }
}

appEventBus.on("knowledge:nodesExtracted", ({ conversationId, touchedNodeIds }) => {
  void extractInterestFromRound(conversationId, touchedNodeIds);
});
