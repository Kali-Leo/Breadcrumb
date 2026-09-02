/**
 * Purpose: zustand store for the mirror cards in the palace rail (spec 035 → 046 → 048) —
 * loads the source tables once and holds the surviving view models: the activity heatmap
 * and the settled list — plus the daily trail sentences, which the launch-time generator
 * refreshes on its own after it writes one.
 * Main exports: useFeedbackStore.
 */
import type { TrailSummaryRow } from "@breadcrumb/core-db";
import type {
  DailyActivityCell,
  LayerTrendPoint,
  TrendPoint,
  WordLayerTrendPoint,
} from "@breadcrumb/feature-feedback";
import { create } from "zustand";
import { type FeedbackData, loadFeedbackData } from "../lib/feedback/feedbackData";
import { loadRecentTrailSummaries } from "../lib/trail/trailSummaryData";

interface FeedbackState {
  loaded: boolean;
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  trends: {
    layers: LayerTrendPoint[];
    wordsSettled: TrendPoint[];
    wordLayers: WordLayerTrendPoint[];
  };
  /** The last days' trail sentences, newest first; empty until loaded or when none exist. */
  trailSummaries: TrailSummaryRow[];
  loadAll(): Promise<void>;
  loadTrailSummaries(): Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  loaded: false,
  cells: [],
  continuity: { activeDays: 0, longestRunDays: 0, currentRunDays: 0 },
  trends: { layers: [], wordsSettled: [], wordLayers: [] },
  trailSummaries: [],

  async loadAll() {
    const data: FeedbackData = await loadFeedbackData();
    set({
      loaded: true,
      cells: data.cells,
      continuity: data.continuity,
      trends: data.trends,
    });
    await get().loadTrailSummaries();
  },

  async loadTrailSummaries() {
    set({ trailSummaries: await loadRecentTrailSummaries() });
  },
}));
