/**
 * Purpose: zustand store for the comparison tree (spec 023) — profile list (builtins
 * imported on first load), the selected profile's overlap tree, expand/collapse and
 * detail-selection UI state, and the experimental search-build flow with its plain
 * cost/outcome line. Standalone module: no planner/ladder/goal state anywhere.
 * Main exports: useCompareStore.
 */
import type { ComparisonProfileRow } from "@breadcrumb/core-db";
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { create } from "zustand";
import { computeComparisonTree, ensureBuiltinProfiles } from "../lib/compareActions";
import { runExperimentalProfileBuild } from "../lib/compareBuildActions";
import { getRepos } from "../lib/db";
import { useSettingsStore } from "./settingsStore";

interface CompareState {
  profiles: ComparisonProfileRow[];
  selectedProfileId: string | null;
  /** The profile's overlap tree under one visible root node (the profile itself). */
  tree: OverlapNode | null;
  /** Keys the user has opened — initial view shows roots only (spec 023 §1). */
  expandedKeys: ReadonlySet<string>;
  /** Node whose match/source details are shown below the tree. */
  detailKey: string | null;
  loading: boolean;
  building: boolean;
  /** Plain outcome line of the last experimental build (includes the token cost). */
  buildNote: string | null;
  load(): Promise<void>;
  selectProfile(profileId: string): Promise<void>;
  toggleExpanded(key: string): void;
  selectDetail(key: string | null): void;
  buildFromTopic(topic: string): Promise<void>;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  tree: null,
  expandedKeys: new Set<string>(),
  detailKey: null,
  loading: false,
  building: false,
  buildNote: null,

  async load() {
    set({ loading: true });
    try {
      await ensureBuiltinProfiles();
      const repos = await getRepos();
      const profiles = await repos.comparisons.listProfiles();
      set({ profiles, loading: false });
      const current = get().selectedProfileId;
      const first = profiles[0];
      if (current === null && first !== undefined) {
        await get().selectProfile(first.id);
      }
    } catch (error) {
      console.warn("comparison profiles load skipped:", error);
      set({ loading: false });
    }
  },

  async selectProfile(profileId) {
    set({ loading: true, detailKey: null });
    try {
      const tree = await computeComparisonTree(profileId);
      set({
        selectedProfileId: profileId,
        tree,
        expandedKeys: new Set<string>(),
        loading: false,
      });
    } catch (error) {
      console.warn("comparison tree compute skipped:", error);
      set({ loading: false });
    }
  },

  toggleExpanded(key) {
    const next = new Set(get().expandedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    set({ expandedKeys: next });
  },

  selectDetail(key) {
    set({ detailKey: key });
  },

  async buildFromTopic(topic) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.compareProfileBuild) return;
    if (!settings.networkEnabled || settings.apiConfig === null) {
      set({ buildNote: "需要联网和 API 配置才能检索构建" });
      return;
    }
    set({ building: true, buildNote: null });
    const outcome = await runExperimentalProfileBuild(settings.apiConfig, {
      topic,
      mainland: settings.mainlandNetwork,
    });
    if (outcome.ok) {
      const dropped =
        outcome.droppedCount > 0 ? `；有 ${outcome.droppedCount} 条因资料没核验通过被丢弃` : "";
      set({ building: false, buildNote: `${outcome.costLine}${dropped}` });
      await get().load();
      await get().selectProfile(outcome.profileId);
    } else {
      const cost = outcome.costLine === null ? "" : `；${outcome.costLine}`;
      set({ building: false, buildNote: `${outcome.reason}${cost}` });
    }
  },
}));
