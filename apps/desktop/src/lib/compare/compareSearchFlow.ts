/**
 * Purpose: the comparison tree's three network-spending flows — the experimental search
 * build (spec 023 §5), on-demand hub decomposition (spec 028 §3) and 一键生成目标 (spec 026
 * §3) — each gated on the feature/network switches and each reporting its own plain
 * cost/outcome line. Split out of stores/compareStore.ts purely to keep that file under the
 * file-size ceiling; it takes set/get as parameters, so there is no runtime dependency back
 * on the store file.
 * Main exports: createCompareSearchActions, CompareSearchActions.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import type { CompareState } from "../../stores/compareStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { persistCalibratedGoal, requestGoalMapping } from "../planner/plannerGoalActions";
import { getRepos } from "../platform/db";
import { computeComparisonTree } from "./compareActions";
import { runExperimentalProfileBuild } from "./compareBuildActions";
import { runHubDecomposition } from "./compareHubActions";

export interface CompareSearchActions {
  buildFromTopic(topic: string): Promise<void>;
  /** Hub decomposition (spec 028 §3): verified search-build of a hub's sub-tree, in place. */
  decomposeHub(node: OverlapNode): Promise<void>;
  /** 一键生成目标 (spec 026 §3): feeds the profile's evidence leaves to goal planning. */
  generateGoalFromProfile(): Promise<void>;
}

export function createCompareSearchActions(
  set: (patch: Partial<CompareState>) => void,
  get: () => CompareState,
): CompareSearchActions {
  return {
    async buildFromTopic(topic) {
      const settings = useSettingsStore.getState();
      if (!settings.featureSwitches.compareProfileBuild) return;
      if (!settings.networkEnabled || settings.apiConfig === null) {
        set({ buildNote: i18next.t("palace:compare.buildNeedsNetwork") });
        return;
      }
      set({ building: true, buildNote: null });
      const outcome = await runExperimentalProfileBuild(settings.apiConfig, {
        topic,
        mainland: settings.mainlandNetwork,
      });
      if (outcome.ok) {
        const dropped =
          outcome.droppedCount > 0
            ? i18next.t("palace:compare.buildDropped", { count: outcome.droppedCount })
            : "";
        set({ building: false, buildNote: `${outcome.costLine}${dropped}` });
        await get().load();
        await get().selectProfile(outcome.profileId);
      } else {
        const cost = outcome.costLine === null ? "" : `；${outcome.costLine}`;
        set({ building: false, buildNote: `${outcome.reason}${cost}` });
      }
    },

    async decomposeHub(node) {
      const settings = useSettingsStore.getState();
      if (!settings.featureSwitches.compareProfileBuild) return;
      if (!settings.networkEnabled || settings.apiConfig === null) {
        set({ buildNote: i18next.t("palace:compare.buildNeedsNetwork") });
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
          outcome.droppedCount > 0
            ? i18next.t("palace:compare.buildDropped", { count: outcome.droppedCount })
            : "";
        const tree = await computeComparisonTree(profileId);
        set({
          decomposingHub: false,
          buildNote: `${outcome.costLine}${dropped}`,
          ...(get().selectedProfileId === profileId ? { tree } : {}),
        });
      } else {
        const cost = outcome.costLine === null ? "" : `；${outcome.costLine}`;
        set({ decomposingHub: false, buildNote: `${outcome.reason}${cost}` });
      }
    },

    async generateGoalFromProfile() {
      const settings = useSettingsStore.getState();
      if (!settings.networkEnabled || settings.apiConfig === null) {
        set({ goalNote: i18next.t("palace:compare.goalNeedsNetwork") });
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
        // Stored text: the title is written to the goal row and the text goes to the model, so
        // neither may carry t()'s bidirectional isolates (see i18n/storedText.ts).
        const goalTitle = asStoredText(
          i18next.t("palace:compare.goalTitle", { profile: profile.title }),
        );
        const goalText = asStoredText(
          i18next.t("palace:compare.goalText", {
            title: goalTitle,
            profile: profile.title,
            leaves: leafLabels.slice(0, 60).join(i18next.t("common:list.separator")),
          }),
        );
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
          goalNote: i18next.t("palace:compare.goalCreated"),
        });
      } catch (error) {
        console.warn("goal generation from profile skipped:", error);
        set({ generatingGoal: false, goalNote: i18next.t("palace:compare.goalFailed") });
      }
    },
  };
}
