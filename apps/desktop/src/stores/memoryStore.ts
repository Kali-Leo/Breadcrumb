/**
 * Purpose: zustand store for memory retention — FSRS retrievability per node, plus the
 * review-worth score the daily helpers pick by, refreshed at launch and after every chat
 * round (re-encounters lift the fog). Both come from one replay. Local and free.
 * Main exports: useMemoryStore.
 */
import { computeNodeMemoryByNode } from "@breadcrumb/feature-memory";
import { create } from "zustand";
import { getRepos } from "../lib/platform/db";
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
