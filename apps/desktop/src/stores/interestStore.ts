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
  buildSelfReportMessages,
  CONFIDENCE_LEVEL_SCORES,
  INTEREST_LEVEL_SCORES,
  type InterestExtractionNode,
  interestSignalsSchema,
  selfReportMappingSchema,
} from "@breadcrumb/plugin-interest";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { llmConfigFrom } from "../lib/llmConfig";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

/** Retries a fallible async call exactly once on failure (parse/network); rethrows the
 * second failure so callers keep their existing silent-degrade handling. */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

interface InterestState {
  /** Node ids the most recent interest-extraction round wrote a signal for. */
  lastSignalNodeIds: string[];
  /** Maps free text like "我学过高中数学" onto existing tree nodes and writes claims. UI
   * lands in spec 012 — this is the wired-up action only. */
  selfReportMastery(userText: string): Promise<void>;
}

export const useInterestStore = create<InterestState>(() => ({
  lastSignalNodeIds: [],

  async selfReportMastery(userText) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.interest || !settings.networkEnabled || !settings.apiConfig) {
      return;
    }
    try {
      const repos = await getRepos();
      const allNodes = await repos.knowledgeNodes.listAll();
      if (allNodes.length === 0) return;

      const config = llmConfigFrom(settings.apiConfig);
      const { parsed, usage } = await chatJson(
        config,
        buildSelfReportMessages(
          userText,
          allNodes.map((node) => node.label),
        ),
        selfReportMappingSchema,
      );
      await recordMeteredCall({
        purpose: "self-report-mapping",
        model: config.model,
        conversationId: null,
        usage,
      });

      const nodeIdByLabel = new Map(allNodes.map((node) => [node.label, node.id]));
      const createdAt = nowIso();
      const changedNodeIds: string[] = [];
      for (const mapping of parsed.mappings) {
        const nodeId = nodeIdByLabel.get(mapping.label);
        if (nodeId === undefined) continue;
        await repos.masteryClaims.insert({
          id: newId(),
          node_id: nodeId,
          level: mapping.claimLevel,
          source: "self-report",
          created_at: createdAt,
        });
        changedNodeIds.push(nodeId);
      }
      if (changedNodeIds.length > 0) {
        appEventBus.emit("mastery:updated", { changedNodeIds });
      }
    } catch (error) {
      console.warn("self-report mastery mapping skipped:", error);
      void recordAiFailure("self-report-mapping", error);
    }
  },
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

    const config = llmConfigFrom(settings.apiConfig);
    const { parsed, usage } = await retryOnce(() =>
      chatJson(
        config,
        buildInterestMessages(touchedNodes, question.content, answer.content),
        interestSignalsSchema,
      ),
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
        curiosity: INTEREST_LEVEL_SCORES[signal.curiosity],
        confusion: INTEREST_LEVEL_SCORES[signal.confusion],
        boredom: INTEREST_LEVEL_SCORES[signal.boredom],
        confidence: CONFIDENCE_LEVEL_SCORES[signal.confidence],
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
    void recordAiFailure("interest", error);
  }
}

appEventBus.on("knowledge:nodesExtracted", ({ conversationId, touchedNodeIds }) => {
  void extractInterestFromRound(conversationId, touchedNodeIds);
});
