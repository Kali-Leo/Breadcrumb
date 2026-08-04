/**
 * Purpose: zustand store driving the pseudo-ranked ladder (spec 016) — fetch-on-view only.
 * viewLadder() decides reuse vs regenerate via planLadderRefresh, calls the ladder-generation
 * LLM only when that decision says "generate", and persists the result. Never auto-refreshes
 * on recompute — the lab panel's 排位 section triggers this itself, once per section mount per
 * goal, treating that render as the user's active viewing (2026-08-04 revision: the old "看看
 * 同行者" button is gone). Band words never leave milestone.ts — this store only carries the
 * raw 0..100 number the UI renders as a progress percentage.
 * Main exports: useLadderStore, LadderView.
 */
import type { GoalLadderRow } from "@breadcrumb/core-db";
import { DIM_THRESHOLD, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  milestone,
  planLadderRefresh,
  type StoredLadder,
  validateLadderGeneration,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import {
  buildLadderDisplayRows,
  buildLadderRows,
  type LadderDisplayRow,
  pickDomainLabelsSample,
  requestLadderGeneration,
} from "../lib/ladderActions";
import { masteryAsSeenByGoal } from "../lib/plannerGapActions";
import { newId, nowIso } from "../lib/time";
import { usePlannerStore } from "./plannerStore";
import { useSettingsStore } from "./settingsStore";

/** Up to 10 lit domain labels ground the generation prompt (spec 016 #3). */
const DOMAIN_LABEL_SAMPLE_SIZE = 10;

export interface LadderView {
  goalId: string;
  milestone: number;
  rows: LadderDisplayRow[];
}

interface LadderState {
  ladder: LadderView | null;
  loading: boolean;
  /** True when the last viewLadder() call threw — drives the "点一下重试" state, distinct
   * from "no goal selected yet" and from a still-in-flight load. */
  failed: boolean;
  viewLadder(goalId: string): Promise<void>;
}

function toStoredLadder(rows: readonly GoalLadderRow[]): StoredLadder | null {
  const first = rows[0];
  if (first === undefined) return null;
  return {
    userMilestoneAtGeneration: first.user_milestone_at_generation,
    figures: rows.map((row) => ({ figureDesc: row.figure_desc, milestone: row.milestone })),
  };
}

export const useLadderStore = create<LadderState>((set) => ({
  ladder: null,
  loading: false,
  failed: false,

  async viewLadder(goalId) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.labPanel) return; // reuses the lab-panel switch (spec 016)

    set({ loading: true, failed: false });
    try {
      const planner = usePlannerStore.getState();
      const goal = planner.goals.find((candidate) => candidate.id === goalId);
      if (goal === undefined) {
        set({ loading: false });
        return;
      }

      const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
      // Same goal-view-boosted mastery coverage() uses — milestone must never disagree with it.
      const goalMasteryByNode = masteryAsSeenByGoal(planner.masteryByNode, planner.claims);
      const currentMilestone = milestone(
        goalNodeIds,
        goalMasteryByNode,
        LIT_THRESHOLD,
        DIM_THRESHOLD,
      );

      const repos = await getRepos();
      const [storedRows, shownRows] = await Promise.all([
        repos.goalLadders.listForGoal(goalId),
        repos.goalLadders.listShownDescriptions(goalId),
      ]);

      const action = planLadderRefresh(toStoredLadder(storedRows), currentMilestone);
      let displayRows: readonly GoalLadderRow[] = storedRows;

      if (action === "generate" && settings.networkEnabled && settings.apiConfig) {
        const forbiddenDescriptions = shownRows.map((row) => row.figure_desc);
        const result = await requestLadderGeneration(settings.apiConfig, {
          goalTitle: goal.title,
          domainLabelsSample: pickDomainLabelsSample(
            goalNodeIds,
            planner.nodes,
            goalMasteryByNode,
            LIT_THRESHOLD,
            DOMAIN_LABEL_SAMPLE_SIZE,
          ),
          userMilestone: currentMilestone,
          forbiddenDescriptions,
        });
        const validated = validateLadderGeneration(result, forbiddenDescriptions);
        if (validated !== null) {
          const nextGeneration = (storedRows[0]?.generation ?? 0) + 1;
          const rows = buildLadderRows(
            goalId,
            nextGeneration,
            currentMilestone,
            validated,
            newId,
            nowIso,
          );
          await repos.goalLadders.replaceForGoal(goalId, rows);
          await repos.goalLadders.recordShownDescriptions(
            goalId,
            rows.map((row) => row.figure_desc),
          );
          displayRows = rows;
        }
        // validated === null: this generation failed validation (<3 usable figures) — fall
        // back to whatever was already stored (possibly none yet) rather than surface an error.
      }

      set({
        loading: false,
        failed: false,
        ladder: {
          goalId,
          milestone: currentMilestone,
          rows: buildLadderDisplayRows(displayRows, currentMilestone),
        },
      });
    } catch (error) {
      console.warn("ladder view skipped:", error);
      void recordAiFailure("ladder", error);
      set({ loading: false, failed: true });
    }
  },
}));
