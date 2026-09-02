/**
 * Purpose: zustand store for the 🔬 research task platform (spec 036) — loads persisted
 * results, deletes one on request (physical delete, the user's right to withdraw), and runs
 * any pending signed tasks from the bundled demo feed against the local DB when idle.
 * Main exports: useResearchStore.
 */
import type { ResearchResultRow } from "@breadcrumb/core-db";
import { runPendingResearchTasks } from "@breadcrumb/feature-research";
import { create } from "zustand";
import { getRepos, getSqlClient } from "../lib/platform/db";
import { recordAiFailure } from "../lib/platform/failureLog";
import { SIGNED_RESEARCH_TASKS } from "../lib/research/researchSampleTask";

interface ResearchState {
  loaded: boolean;
  results: ResearchResultRow[];
  load(): Promise<void>;
  deleteResult(id: string): Promise<void>;
  runPending(): Promise<void>;
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  loaded: false,
  results: [],

  async load() {
    const repos = await getRepos();
    const results = await repos.research.listResults();
    set({ loaded: true, results });
  },

  async deleteResult(id) {
    const repos = await getRepos();
    await repos.research.deleteResult(id);
    set({ results: get().results.filter((result) => result.id !== id) });
  },

  /** Runs every not-yet-run signed task in the bundled feed. Silent-failure path matches
   * every other AI pipeline (spec 014): a bad or expired task never surfaces to the user. */
  async runPending() {
    const sql = await getSqlClient();
    const executed = await runPendingResearchTasks(SIGNED_RESEARCH_TASKS, {
      sql,
      now: () => new Date(),
      recordFailure: (message) => recordAiFailure("research-task", message),
    });
    if (executed > 0) {
      await get().load();
    }
  },
}));
