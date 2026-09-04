/**
 * Purpose: zustand store for memory retention — FSRS retrievability per node, plus the
 * review-worth score the daily helpers pick by, refreshed at launch and after every chat
 * round (re-encounters lift the fog). Both come from one replay. Local and free.
 * Main exports: useMemoryStore.
 */
import { computeNodeMemoryByNode } from "@breadcrumb/feature-memory";
import { create } from "zustand";
import { getRepos } from "../lib/platform/db";
import { degradeSilently } from "../lib/platform/failureLog";
import { nowIso } from "../lib/platform/time";
import { appEventBus } from "./chatStore";

interface MemoryState {
  retentionByNode: ReadonlyMap<string, number>;
  /** Higher = a review of this concept is worth more today (expected FSRS gain + rescue). */
  reviewPriorityByNode: ReadonlyMap<string, number>;
  refresh(): Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  retentionByNode: new Map(),
  reviewPriorityByNode: new Map(),

  async refresh() {
    // The whole body is guarded. Two of the three callers `await` this (chatConversationActions,
    // companionDailyGate) and the third — MapView's mount effect — is a bare `void refresh()`,
    // so before the guard a single throw in here left retentionByNode empty forever: an
    // all-fog map and no daily helpers, with an unhandled rejection as the only trace.
    // Degrading is right for this store: fog and helper ordering are enrichments of a map that
    // still renders, so the app keeps working on the previous (or empty) maps and the reason
    // lands in ai_failures where the lab panel shows it.
    try {
      const repos = await getRepos();
      const sightings = await repos.nodeSightings.listAll();
      const memory = computeNodeMemoryByNode(sightings, nowIso());
      const retentionByNode = new Map<string, number>();
      const reviewPriorityByNode = new Map<string, number>();
      for (const [nodeId, node] of memory) {
        retentionByNode.set(nodeId, node.retention);
        reviewPriorityByNode.set(nodeId, node.reviewPriority);
      }
      set({ retentionByNode, reviewPriorityByNode });
    } catch (error) {
      await degradeSilently("memory-refresh", error);
    }
  },
}));

// One trailing timer, not a queue — parallel rounds finishing close together used to
// stack several full FSRS recomputes.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
appEventBus.on("chat:responseFinished", () => {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useMemoryStore.getState().refresh();
  }, 7000);
});
