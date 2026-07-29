/**
 * Purpose: zustand store for memory retention — FSRS retrievability per node, refreshed
 * at launch and after every chat round (re-encounters lift the fog). Local and free.
 * Main exports: useMemoryStore.
 */
import { computeRetentionByNode } from "@breadcrumb/plugin-memory";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";

interface MemoryState {
  retentionByNode: ReadonlyMap<string, number>;
  refresh(): Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  retentionByNode: new Map(),

  async refresh() {
    const repos = await getRepos();
    const sightings = await repos.nodeSightings.listAll();
    set({ retentionByNode: computeRetentionByNode(sightings, nowIso()) });
  },
}));

appEventBus.on("chat:responseFinished", () => {
  setTimeout(() => void useMemoryStore.getState().refresh(), 7000);
});
