/**
 * Purpose: zustand store for the comparison tree (spec 023) — profile list (builtins
 * imported on first load), the selected profile's overlap tree, expand/collapse and
 * detail-selection UI state, and the experimental search-build flow with its plain
 * cost/outcome line. Standalone module: no planner/ladder/goal state anywhere. The
 * per-profile actions live in compareStoreSelection.ts and the network-spending flows in
 * lib/compare/compareSearchFlow.ts; this file holds the state itself.
 * Main exports: useCompareStore, CompareState.
 */
import type { ComparisonProfileRow } from "@breadcrumb/core-db";
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { create } from "zustand";
import { ensureBuiltinProfiles } from "../lib/compare/compareActions";
import {
  type CompareSearchActions,
  createCompareSearchActions,
} from "../lib/compare/compareSearchFlow";
import { getRepos } from "../lib/platform/db";
import { degradeSilently } from "../lib/platform/failureLog";
import {
  type CompareProfileViewState,
  type CompareSelectionActions,
  createCompareSelectionActions,
} from "./compareStoreSelection";

export interface CompareState extends CompareSelectionActions, CompareSearchActions {
  profiles: ComparisonProfileRow[];
  selectedProfileId: string | null;
  /** The profile's overlap tree under one visible root node (the profile itself). */
  tree: OverlapNode | null;
  /** Keys the user has opened — initial view shows roots only (spec 023 §1). Mirrors the
   * selected profile's entry in viewStateByProfile (chatStore sessions/mirror pattern). */
  expandedKeys: ReadonlySet<string>;
  /** Node whose match/source details are shown below the tree. Mirrors the selected
   * profile's entry in viewStateByProfile. */
  detailKey: string | null;
  /** Saved view state for every profile visited this session, keyed by profile id — restored
   * on return instead of resetting to roots-only. */
  viewStateByProfile: ReadonlyMap<string, CompareProfileViewState>;
  loading: boolean;
  building: boolean;
  /** True while the background semantic alignment for the selected profile runs — drives the
   * plain "语义对齐进行中…" note; the string-matched tree shows instantly regardless. */
  aligning: boolean;
  /** Plain outcome line of the last experimental build (includes the token cost). */
  buildNote: string | null;
  /** The learner's own 0–10 scores on pure experience leaves, item id → score (spec 029). */
  scoreByItemId: ReadonlyMap<string, number>;
  /** Plain outcome line of the last 一键生成目标 run. */
  goalNote: string | null;
  generatingGoal: boolean;
  load(): Promise<void>;
  toggleExpanded(key: string): void;
  selectDetail(key: string | null): void;
  decomposingHub: boolean;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  tree: null,
  expandedKeys: new Set<string>(),
  detailKey: null,
  viewStateByProfile: new Map<string, CompareProfileViewState>(),
  loading: false,
  building: false,
  aligning: false,
  buildNote: null,
  scoreByItemId: new Map<string, number>(),
  goalNote: null,
  generatingGoal: false,
  decomposingHub: false,

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
      void degradeSilently("compare-profile", error);
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

  ...createCompareSelectionActions(set, get),
  ...createCompareSearchActions(set, get),
}));
