/**
 * Purpose: zustand store driving the ladder's assessment display (spec 022). The ladder IS a
 * real-time assessment wearing a leaderboard's clothes: viewLadder() serves the cached
 * three-title board, re-running the LLM assessment only when the board's randomized expiry
 * has passed (or no board exists yet). pregenerateIfDue() is the quiet background variant so
 * the next actual view is instant. No ranks, no fuel, no mechanism — display only.
 * Main exports: useLadderStore, LadderView.
 */
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  goalDomainClosure,
  isRefreshDue,
  nextRefreshAtIso,
  validateLadderAssessment,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { buildKnowledgeSnapshot, requestLadderAssessment } from "../lib/ladderActions";
import { masteryAsSeenByGoal } from "../lib/plannerGapActions";
import { nowIso } from "../lib/time";
import { usePlannerStore } from "./plannerStore";
import { useSettingsStore } from "./settingsStore";

export interface LadderView {
  goalId: string;
  /** The state one small step ahead of the learner's — the row above. */
  aboveTitle: string;
  /** The learner's own 称号: a plain AI summary of what they currently grasp. */
  selfTitle: string;
  /** The state one small step behind — the row below. */
  belowTitle: string;
}

interface LadderState {
  ladder: LadderView | null;
  loading: boolean;
  /** True when the last viewLadder() call ended with nothing to show — drives "点一下重试". */
  failed: boolean;
  viewLadder(goalId: string): Promise<void>;
  /** Quiet background check: re-assesses an expired board without touching view state. */
  pregenerateIfDue(goalId: string): Promise<void>;
}

/** Runs the assessment for one goal and returns the fresh board row, or null when it can't
 * run (offline / no API config) or the result failed validation — the caller keeps whatever
 * board it had. */
async function assessGoal(goalId: string) {
  const settings = useSettingsStore.getState();
  if (!settings.networkEnabled || !settings.apiConfig) return null;
  const planner = usePlannerStore.getState();
  const goal = planner.goals.find((candidate) => candidate.id === goalId);
  if (goal === undefined) return null;
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  const closureNodeIds = goalDomainClosure(planner.edges, goalNodeIds);
  const snapshot = buildKnowledgeSnapshot(
    closureNodeIds,
    planner.nodes,
    masteryAsSeenByGoal(planner.masteryByNode, planner.claims),
    LIT_THRESHOLD,
  );
  const result = await requestLadderAssessment(settings.apiConfig, {
    goalTitle: goal.title,
    learnedItems: snapshot.learnedItems,
    notYetLabels: snapshot.notYetLabels,
  });
  const validated = validateLadderAssessment(result);
  if (validated === null) {
    void recordAiFailure("ladder", new Error("assessment failed validation"));
    return null;
  }
  const now = nowIso();
  return {
    goal_id: goalId,
    above_title: validated.aboveTitle,
    self_title: validated.selfTitle,
    below_title: validated.belowTitle,
    next_refresh_at: nextRefreshAtIso(now, `${goalId}:${now}`),
    updated_at: now,
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
      const repos = await getRepos();
      let board = await repos.goalLadders.getBoard(goalId);
      if (board === null || isRefreshDue(board.next_refresh_at, nowIso())) {
        const fresh = await assessGoal(goalId);
        if (fresh !== null) {
          await repos.goalLadders.upsertBoard(fresh);
          board = fresh;
        }
      }
      if (board === null) {
        set({ loading: false, failed: true });
        return;
      }
      set({
        loading: false,
        failed: false,
        ladder: {
          goalId,
          aboveTitle: board.above_title,
          selfTitle: board.self_title,
          belowTitle: board.below_title,
        },
      });
    } catch (error) {
      console.warn("ladder view skipped:", error);
      void recordAiFailure("ladder", error);
      set({ loading: false, failed: true });
    }
  },

  async pregenerateIfDue(goalId) {
    try {
      const repos = await getRepos();
      const board = await repos.goalLadders.getBoard(goalId);
      if (board !== null && !isRefreshDue(board.next_refresh_at, nowIso())) return;
      const fresh = await assessGoal(goalId);
      if (fresh === null) return;
      await repos.goalLadders.upsertBoard(fresh);
    } catch (error) {
      void recordAiFailure("ladder", error);
    }
  },
}));
