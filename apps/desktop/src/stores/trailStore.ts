/**
 * Purpose: zustand store for the trail panel — today's breadcrumbs (knowledge nodes) and
 * the gentle yesterday-summary (generated once per day when the switch is on).
 * Main exports: useTrailStore.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildTrailSummaryMessages,
  localDateString,
  localDayRange,
  trailSummarySchema,
} from "@breadcrumb/plugin-trail";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { recordMeteredCall } from "../lib/metering";
import { nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

interface TrailState {
  todayNodes: KnowledgeNodeRow[];
  yesterdaySummary: string | null;
  refreshToday(): Promise<void>;
  ensureYesterdaySummary(): Promise<void>;
}

export const useTrailStore = create<TrailState>((set) => ({
  todayNodes: [],
  yesterdaySummary: null,

  async refreshToday() {
    const repos = await getRepos();
    const { fromIso, toIso } = localDayRange(new Date(), 0);
    const todayNodes = await repos.knowledgeNodes.listFirstSightedBetween(fromIso, toIso);
    set({ todayNodes });
  },

  /** Generates yesterday's one-liner at most once; silent no-op when off/offline/empty. */
  async ensureYesterdaySummary() {
    const repos = await getRepos();
    const yesterdayDate = localDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const stored = await repos.trailSummaries.get(yesterdayDate);
    if (stored) {
      set({ yesterdaySummary: stored.content });
      return;
    }
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.trail || !settings.networkEnabled || !settings.apiConfig) return;
    const { fromIso, toIso } = localDayRange(new Date(), -1);
    const yesterdayNodes = await repos.knowledgeNodes.listFirstSightedBetween(fromIso, toIso);
    if (yesterdayNodes.length === 0) return;

    try {
      const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
      const { parsed, usage } = await chatJson(
        config,
        buildTrailSummaryMessages(yesterdayNodes),
        trailSummarySchema,
      );
      await recordMeteredCall({
        purpose: "trail",
        model: config.model,
        conversationId: null,
        usage,
      });
      await repos.trailSummaries.set({
        date: yesterdayDate,
        content: parsed.summary,
        created_at: nowIso(),
      });
      set({ yesterdaySummary: parsed.summary });
    } catch (error) {
      console.warn("trail summary skipped:", error);
      void recordAiFailure("trail", error);
    }
  },
}));

// New breadcrumbs appear as soon as extraction lands them (small refresh; cheap query).
appEventBus.on("chat:responseFinished", () => {
  setTimeout(() => void useTrailStore.getState().refreshToday(), 4000);
});
