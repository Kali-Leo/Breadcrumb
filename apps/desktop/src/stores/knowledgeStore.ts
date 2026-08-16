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
import { anchorNodesByAlias } from "../lib/compareAlignActions";
import { getRepos } from "../lib/db";
import { embedNodes } from "../lib/embeddings";
import { recordAiFailure } from "../lib/failureLog";
import { recordMeteredCall } from "../lib/metering";
import { runSynonymGate } from "../lib/synonymGate";
import { newId, nowIso } from "../lib/time";
import { refreshConversationAutoTitle } from "../lib/trailNamingActions";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

interface KnowledgeState {
  /** The whole user tree (global — grows across conversations). */
  nodes: KnowledgeNodeRow[];
  /** Node ids this conversation walked past, in walking order (session trail). */
  sessionNodeIds: string[];
  freshNodeIds: ReadonlySet<string>;
  /** Steers the round's system prompt (chatRoundContext.ts) and stamps sighting provenance
   * (spec 040 §7). Always null now that the ordinary-chat UI entries that used to set it
   * (the explore door card, the station map) are gone (spec 042 §6) — kept as read-only state
   * rather than removed outright, since both of those consumers still degrade correctly on
   * null and a future entry point may want it again. */
  anchoredNodeId: string | null;
  loadTree(): Promise<void>;
  loadSessionTrail(conversationId: string | null): Promise<void>;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
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
}));

/** Extracts knowledge from the finished round; failures degrade silently (spec 002). */
async function extractFromFinishedRound(
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
    // Both the trail check and the current trail are read AT WRITE TIME — the extraction
    // spans awaits during which the user may have switched conversations, and a stale
    // snapshot here used to write the old conversation's footprints over the new one's.
    useKnowledgeStore.setState((state) => {
      const isViewingThisConversation =
        useChatStore.getState().activeConversationId === conversationId;
      return {
        nodes: refreshedNodes,
        freshNodeIds: new Set(plan.newNodes.map((node) => node.id)),
        sessionNodeIds: isViewingThisConversation
          ? [
              ...state.sessionNodeIds,
              ...plan.sightings
                .map((sighting) => sighting.node_id)
                .filter((nodeId) => !state.sessionNodeIds.includes(nodeId)),
            ]
          : state.sessionNodeIds,
      };
    });
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

appEventBus.on("chat:responseFinished", ({ conversationId, anchoredNodeId }) => {
  void extractFromFinishedRound(conversationId, anchoredNodeId);
});
