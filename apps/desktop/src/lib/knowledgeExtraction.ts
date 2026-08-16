/**
 * Purpose: the background knowledge-extraction pipeline for a finished chat round (spec 002)
 * — LLM extraction, synonym gate, persistence, embeddings, alias anchoring, then folding the
 * results into the knowledge store's layered trail state at write time. Moved out of
 * knowledgeStore.ts to keep the store under the 200-line limit.
 * Main exports: extractFromFinishedRound.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildExtractionMessages,
  extractionResponseSchema,
  planNodeChanges,
} from "@breadcrumb/plugin-knowledge-tree";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { anchorNodesByAlias } from "./compareAlignActions";
import { getRepos } from "./db";
import { embedNodes } from "./embeddings";
import { recordAiFailure } from "./failureLog";
import { foldExtractionIntoTrailState } from "./knowledgeTrailFold";
import { recordMeteredCall } from "./metering";
import { runSynonymGate } from "./synonymGate";
import { newId, nowIso } from "./time";
import { refreshConversationAutoTitle } from "./trailNamingActions";

/** Extracts knowledge from the finished round; failures degrade silently (spec 002). */
export async function extractFromFinishedRound(
  conversationId: string,
  roundAnchoredNodeId: string | null,
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.knowledgeTree || !settings.networkEnabled || !settings.apiConfig) {
    return;
  }
  const chatMessages = useChatStore.getState().messagesFor(conversationId);
  const answer = chatMessages.at(-1);
  const question = chatMessages.at(-2);
  if (answer?.role !== "assistant" || question?.role !== "user") return;

  try {
    const repos = await getRepos();
    const existingNodes = await repos.knowledgeNodes.listAll();
    const aliases = await repos.nodeAliases.listAll();
    const aliasNodeIdByLabel = new Map(aliases.map((alias) => [alias.alias_label, alias.node_id]));
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

    const rawPlan = planNodeChanges({
      conversationId,
      sourceMessageId: answer.id,
      existingNodes,
      extracted: parsed.nodes,
      aliasNodeIdByLabel,
      newId,
      nowIso,
    });
    // Node-dedup gate (spec 015): filters would-be-new nodes against the existing tree by
    // embedding similarity + one anchored LLM verdict before anything gets inserted.
    // Degrades to rawPlan unchanged on any failure — never blocks extraction.
    const plan = await runSynonymGate({
      plan: rawPlan,
      existingNodes,
      conversationId,
      sourceMessageId: answer.id,
      config,
    });

    for (const node of plan.newNodes) {
      await repos.knowledgeNodes.insert(node);
    }
    // Provenance (spec 040 §7): every station born this round grew from the round's
    // anchored node — captured at SEND time and carried in the event, because by now the
    // live anchor may have changed or cleared. A sighting whose own node IS the anchor has
    // no parent to record (it IS the anchor).
    const anchoredNodeId = roundAnchoredNodeId;
    for (const sighting of plan.sightings) {
      await repos.nodeSightings.record({
        ...sighting,
        origin_node_id: sighting.node_id === anchoredNodeId ? null : anchoredNodeId,
      });
    }
    for (const alias of plan.aliasesToInsert) {
      await repos.nodeAliases.insert(alias);
    }
    // Local, zero-cost, and best-effort: powers edge-candidate ranking later, never blocks chat.
    await embedNodes(plan.newNodes);
    // Entry anchoring (spec 025): newborn nodes try the free alias path against the
    // canonical inventory right where they are born — fire-and-forget, never blocks chat.
    void anchorNodesByAlias(plan.newNodes);

    const refreshedNodes = await repos.knowledgeNodes.listAll();
    // Both the viewing check and the current trail are read AT WRITE TIME — the extraction
    // spans awaits during which the user may have switched conversations. The trail lands
    // in THIS round's conversation layer; the active mirror and fresh highlights only
    // follow while that conversation is on screen (knowledgeTrailFold).
    const { useKnowledgeStore } = await import("../stores/knowledgeStore");
    useKnowledgeStore.setState((state) => ({
      nodes: refreshedNodes,
      ...foldExtractionIntoTrailState(state, {
        conversationId,
        isViewingThisConversation: useChatStore.getState().activeConversationId === conversationId,
        sightedNodeIds: plan.sightings.map((sighting) => sighting.node_id),
        freshNodeIds: plan.newNodes.map((node) => node.id),
      }),
    }));
    if (plan.sightings.length > 0 || plan.newNodes.length > 0) {
      appEventBus.emit("knowledge:nodesExtracted", {
        conversationId,
        freshNodeIds: plan.newNodes.map((node) => node.id),
        touchedNodeIds: plan.sightings.map((sighting) => sighting.node_id),
      });
      // Trail-card auto-naming (spec 041 §1): this round's new stations, if any, may move the
      // "first -> last" name; refresh the one card, then reload the sidebar's list to show it.
      const labelsByNode = new Map(refreshedNodes.map((node) => [node.id, node.label]));
      await refreshConversationAutoTitle(repos, conversationId, labelsByNode);
      await useChatStore.getState().loadFromDatabase();
    }
  } catch (error) {
    console.warn("knowledge extraction skipped:", error);
    void recordAiFailure("knowledge-tree", error);
  }
}
