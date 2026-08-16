/**
 * Purpose: zustand store for the USER's global knowledge tree (global by design) plus
 * per-conversation trail layers — filled on first visit, never wiped on switch (layers
 * accumulate for conversations visited this app session, the Discord tradeoff) — with an
 * active mirror plus fresh-node highlighting and anchoring. Side effect on import:
 * subscribes to the app bus (extraction pipeline lives in lib/knowledgeExtraction).
 * Main exports: useKnowledgeStore.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { createSingleFlightLoader, setConversationLayer } from "../lib/conversationLayers";
import { getRepos } from "../lib/db";
import { extractFromFinishedRound } from "../lib/knowledgeExtraction";
import { appEventBus, useChatStore } from "./chatStore";

interface KnowledgeState {
  /** The whole user tree (global — grows across conversations). */
  nodes: KnowledgeNodeRow[];
  /** Active mirror of the open conversation's trail layer — node ids it walked past, in
   * walking order (MapView reads this). trailByConversation is the source of truth. */
  sessionNodeIds: string[];
  trailByConversation: ReadonlyMap<string, string[]>;
  /** View-scoped: only the round that finished while its conversation was on screen sets
   * this (lib/knowledgeTrailFold), and a switch resets it — highlights never leak across. */
  freshNodeIds: ReadonlySet<string>;
  /** Steers the round's system prompt (chatRoundContext.ts) and stamps sighting provenance
   * (spec 040 §7). Always null now that the ordinary-chat UI entries that used to set it
   * (the explore door card, the station map) are gone (spec 042 §6) — kept as read-only state
   * rather than removed outright, since both of those consumers still degrade correctly on
   * null and a future entry point may want it again. */
  anchoredNodeId: string | null;
  loadTree(): Promise<void>;
  /** Fill-on-first-visit: loads a conversation's trail layer once and mirrors it; revisits
   * mirror the cached layer instantly with no refetch. Null just empties the mirror. */
  ensureTrailLoaded(conversationId: string | null): Promise<void>;
}

const singleFlightLoad = createSingleFlightLoader();

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  nodes: [],
  sessionNodeIds: [],
  trailByConversation: new Map(),
  freshNodeIds: new Set(),
  anchoredNodeId: null,

  async loadTree() {
    const repos = await getRepos();
    set({ nodes: await repos.knowledgeNodes.listAll() });
  },

  async ensureTrailLoaded(conversationId) {
    if (conversationId === null) {
      set({ sessionNodeIds: [], freshNodeIds: new Set(), anchoredNodeId: null });
      return;
    }
    const cached = get().trailByConversation.get(conversationId);
    if (cached !== undefined) {
      set({ sessionNodeIds: cached, freshNodeIds: new Set(), anchoredNodeId: null });
      return;
    }
    // The previous conversation's trail must not show against the new one while loading.
    set({ sessionNodeIds: [], freshNodeIds: new Set(), anchoredNodeId: null });
    await singleFlightLoad(conversationId, async () => {
      if (get().trailByConversation.has(conversationId)) return;
      const repos = await getRepos();
      const sightings = await repos.nodeSightings.listByConversation(conversationId);
      const trail = [...new Set(sightings.map((sighting) => sighting.node_id))];
      // Mirror re-checked at write time — a slow load must not overwrite a newer switch.
      set((state) => ({
        trailByConversation: setConversationLayer(state.trailByConversation, conversationId, trail),
        ...(useChatStore.getState().activeConversationId === conversationId
          ? { sessionNodeIds: trail }
          : {}),
      }));
    });
  },
}));

appEventBus.on("chat:responseFinished", ({ conversationId, anchoredNodeId }) => {
  void extractFromFinishedRound(conversationId, anchoredNodeId);
});
