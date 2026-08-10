/**
 * Purpose: zustand store for the comparison tree (spec 023) — profile list (builtins
 * imported on first load), the selected profile's overlap tree, expand/collapse and
 * detail-selection UI state, and the experimental search-build flow with its plain
 * cost/outcome line. Standalone module: no planner/ladder/goal state anywhere.
 * Main exports: useCompareStore.
 */
import type { ComparisonProfileRow, PracticeStatus } from "@breadcrumb/core-db";
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { create } from "zustand";
import { computeComparisonTree, ensureBuiltinProfiles } from "../lib/compareActions";
import { runAnchorSweep } from "../lib/compareAlignActions";
import { runExperimentalProfileBuild } from "../lib/compareBuildActions";
import { runHubDecomposition } from "../lib/compareHubActions";
import { getRepos } from "../lib/db";
import { createOccupationProfile, openPracticeConversation } from "../lib/occupationActions";
import { persistCalibratedGoal, requestGoalMapping } from "../lib/plannerGoalActions";
import { nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { usePlannerStore } from "./plannerStore";
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
  /** True while the background semantic alignment for the selected profile runs — drives the
   * plain "语义对齐进行中…" note; the string-matched tree shows instantly regardless. */
  aligning: boolean;
  /** Plain outcome line of the last experimental build (includes the token cost). */
  buildNote: string | null;
  /** The learner's own practice statements, item id → status (spec 026). */
  attestationByItemId: ReadonlyMap<string, PracticeStatus>;
  /** Plain outcome line of the last 一键生成目标 run. */
  goalNote: string | null;
  generatingGoal: boolean;
  load(): Promise<void>;
  selectProfile(profileId: string): Promise<void>;
  toggleExpanded(key: string): void;
  selectDetail(key: string | null): void;
  buildFromTopic(topic: string): Promise<void>;
  /** Builds the chosen occupation's profile offline and selects it (spec 026). */
  createOccupation(code: string): Promise<void>;
  /** Records the learner's own statement about a practice item and rescores locally. */
  setPracticeStatus(itemId: string, status: PracticeStatus): Promise<void>;
  /** Opens (or resumes) the saved-but-sidebar-hidden discussion for a practice item. */
  discussPractice(node: OverlapNode): Promise<void>;
  /** 一键生成目标 (spec 026 §3): feeds the profile's evidence leaves to goal planning. */
  generateGoalFromProfile(): Promise<void>;
  /** Hub decomposition (spec 028 §3): verified search-build of a hub's sub-tree, in place. */
  decomposeHub(node: OverlapNode): Promise<void>;
  decomposingHub: boolean;
}

/** Fire-and-forget anchor sweep (spec 025 — profile-agnostic: anchors are node↔concept, so
 * one sweep serves every profile); when new pairs got judged, quietly recompute the tree so
 * semantic matches appear without the user doing anything. */
async function sweepInBackground(
  refresh: () => Promise<void>,
  setAligning: (aligning: boolean) => void,
): Promise<void> {
  setAligning(true);
  try {
    const judged = await runAnchorSweep();
    if (judged !== null && judged > 0) await refresh();
  } catch (error) {
    console.warn("anchor sweep skipped:", error);
  } finally {
    setAligning(false);
  }
}

export const useCompareStore = create<CompareState>((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  tree: null,
  expandedKeys: new Set<string>(),
  detailKey: null,
  loading: false,
  building: false,
  aligning: false,
  buildNote: null,
  attestationByItemId: new Map<string, PracticeStatus>(),
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
      console.warn("comparison profiles load skipped:", error);
      set({ loading: false });
    }
  },

  async selectProfile(profileId) {
    set({ loading: true, detailKey: null });
    try {
      // Immediate path (spec 024 §2): the string-matched tree renders NOW; semantic
      // alignment runs behind it and quietly patches the tree when new verdicts land.
      const repos = await getRepos();
      const [tree, attestations] = await Promise.all([
        computeComparisonTree(profileId),
        repos.practice.listAttestations(),
      ]);
      set({
        selectedProfileId: profileId,
        tree,
        attestationByItemId: new Map(attestations.map((row) => [row.item_id, row.status])),
        expandedKeys: new Set<string>(),
        loading: false,
        goalNote: null,
      });
      void sweepInBackground(
        async () => {
          const selected = get().selectedProfileId;
          if (selected === null) return;
          const refreshed = await computeComparisonTree(selected);
          set({ tree: refreshed });
        },
        (aligning) => set({ aligning }),
      );
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

  async createOccupation(code) {
    set({ loading: true });
    try {
      const profileId = await createOccupationProfile(code);
      await get().load();
      if (profileId !== null) await get().selectProfile(profileId);
      else set({ loading: false });
    } catch (error) {
      console.warn("occupation profile creation skipped:", error);
      set({ loading: false });
    }
  },

  async setPracticeStatus(itemId, status) {
    try {
      const repos = await getRepos();
      await repos.practice.upsertAttestation({
        item_id: itemId,
        status,
        attested_at: nowIso(),
      });
      const next = new Map(get().attestationByItemId);
      next.set(itemId, status);
      set({ attestationByItemId: next });
      const selected = get().selectedProfileId;
      if (selected !== null) {
        const tree = await computeComparisonTree(selected);
        set({ tree });
      }
    } catch (error) {
      console.warn("practice attestation skipped:", error);
    }
  },

  async discussPractice(node) {
    try {
      const conversationId = await openPracticeConversation(node.label, node.sourceRef);
      appEventBus.emit("app:navigateChat", { conversationId });
    } catch (error) {
      console.warn("practice discussion skipped:", error);
    }
  },

  async decomposeHub(node) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.compareProfileBuild) return;
    if (!settings.networkEnabled || settings.apiConfig === null) {
      set({ buildNote: "需要联网和 API 配置才能检索构建" });
      return;
    }
    const profileId = get().selectedProfileId;
    if (profileId === null) return;
    set({ decomposingHub: true, buildNote: null });
    const outcome = await runHubDecomposition(settings.apiConfig, {
      profileId,
      hubItemId: node.key,
      topic: node.label,
      mainland: settings.mainlandNetwork,
    });
    if (outcome.ok) {
      const dropped =
        outcome.droppedCount > 0 ? `；有 ${outcome.droppedCount} 条因资料没核验通过被丢弃` : "";
      const tree = await computeComparisonTree(profileId);
      set({ decomposingHub: false, buildNote: `${outcome.costLine}${dropped}`, tree });
    } else {
      const cost = outcome.costLine === null ? "" : `；${outcome.costLine}`;
      set({ decomposingHub: false, buildNote: `${outcome.reason}${cost}` });
    }
  },

  async generateGoalFromProfile() {
    const settings = useSettingsStore.getState();
    if (!settings.networkEnabled || settings.apiConfig === null) {
      set({ goalNote: "需要联网和 API 配置才能生成目标" });
      return;
    }
    const selected = get().selectedProfileId;
    const profile = get().profiles.find((candidate) => candidate.id === selected);
    const tree = get().tree;
    if (selected === null || profile === undefined || tree === null) return;
    set({ generatingGoal: true, goalNote: null });
    try {
      // Evidence-grounded goal text (spec 026 §3): the profile's own leaf list rides along,
      // so decomposition selects from cited material instead of inventing.
      const leafLabels: string[] = [];
      const walk = (node: OverlapNode): void => {
        if (node.isLeaf && (node.kind === "knowledge" || node.kind === "tool")) {
          leafLabels.push(node.label);
        }
        for (const child of node.children) walk(child);
      };
      walk(tree);
      const goalTitle = `胜任 ${profile.title}`;
      const goalText = `${goalTitle}。该方向的官方知识与工具清单（${profile.title}，供选取，不必全收）：${leafLabels
        .slice(0, 60)
        .join("、")}`;
      const planner = usePlannerStore.getState();
      const mapping = await requestGoalMapping(
        settings.apiConfig,
        goalText,
        planner.nodes.map((node) => node.label),
      );
      const repos = await getRepos();
      await persistCalibratedGoal(repos, goalTitle, mapping, planner.nodes);
      await planner.recompute();
      set({
        generatingGoal: false,
        goalNote: "目标已生成——学习引导交给推荐系统；这里随时可以回来看重合比例",
      });
    } catch (error) {
      console.warn("goal generation from profile skipped:", error);
      set({ generatingGoal: false, goalNote: "这一步没能完成，可以点一下重试" });
    }
  },
}));
