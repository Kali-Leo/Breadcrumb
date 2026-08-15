/**
 * Purpose: zustand store for the mirror cards in the palace rail (spec 035 → 046 → 048) —
 * loads the source tables once and holds the surviving view models: the activity heatmap
 * and the settled list.
 * Main exports: useFeedbackStore.
 */
import type { DailyActivityCell, SettledResult } from "@breadcrumb/plugin-feedback";
import { create } from "zustand";
import { type FeedbackData, loadFeedbackData } from "../lib/feedbackData";

interface FeedbackState {
  loaded: boolean;
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  settled: SettledResult;
  loadAll(): Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  loaded: false,
  cells: [],
  continuity: { activeDays: 0, longestRunDays: 0, currentRunDays: 0 },
  settled: { nodes: [], words: [] },

  async loadAll() {
    const data: FeedbackData = await loadFeedbackData();
    set({
      loaded: true,
      cells: data.cells,
      continuity: data.continuity,
      settled: data.settled,
    });
  },
}));
