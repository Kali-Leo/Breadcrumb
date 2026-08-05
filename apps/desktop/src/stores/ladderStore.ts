/**
 * Purpose: zustand store driving the ranked ladder (spec 020) — viewLadder() resolves the
 * shown rank (never worse while the learner keeps learning, bounded slip-back after long
 * absence), reports the plain up/down delta since last view, and regenerates the whole
 * deceased-famous-neighbor board only when its randomized expiry has passed.
 * pregenerateIfDue() is the quiet background variant: it refreshes an expired board without
 * touching the last-seen state, so the next view is instant and the delta stays honest.
 * Main exports: useLadderStore, LadderView.
 */
import type { GoalLadderStateRow } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  domainFuel,
  goalDomainClosure,
  isRefreshDue,
  neighborRanks,
  nextRefreshAtIso,
  resolveShownRank,
  startRank,
  validateLadderGeneration,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import {
  buildKnowledgeSnapshot,
  buildLadderDisplayRows,
  buildLadderFigureRows,
  type LadderDisplayRow,
  requestLadderGeneration,
} from "../lib/ladderActions";
import { masteryAsSeenByGoal } from "../lib/plannerGapActions";
import { newId, nowIso } from "../lib/time";
import { usePlannerStore } from "./plannerStore";
import { useSettingsStore } from "./settingsStore";

export interface LadderView {
  goalId: string;
  userRank: number;
  /** Ranks improved since the learner last looked (positive), slipped (negative), or null on
   * the very first view — drives the plain "up/down since last time" line. */
  rankDelta: number | null;
  rows: LadderDisplayRow[];
}

interface LadderState {
  ladder: LadderView | null;
  loading: boolean;
  /** True when the last viewLadder() call threw — drives the "点一下重试" state. */
  failed: boolean;
  viewLadder(goalId: string): Promise<void>;
  /** Quiet background check: regenerates an expired board without recording a "view". */
  pregenerateIfDue(goalId: string): Promise<void>;
}

/** The learner's rank context for one goal, recomputed fresh from planner state every call. */
function rankContext(goalId: string) {
  const planner = usePlannerStore.getState();
  const goal = planner.goals.find((candidate) => candidate.id === goalId);
  if (goal === undefined) return null;
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  const goalMasteryByNode = masteryAsSeenByGoal(planner.masteryByNode, planner.claims);
  const closureNodeIds = goalDomainClosure(planner.edges, goalNodeIds);
  const fuel = domainFuel(closureNodeIds, goalMasteryByNode);
  return { planner, goal, closureNodeIds, goalMasteryByNode, fuel };
}

/** Regenerates the board for one expired goal and returns the fresh figure rows, or null when
 * the generation failed validation (the caller keeps whatever board it had). */
async function regenerateBoard(
  context: NonNullable<ReturnType<typeof rankContext>>,
  goalId: string,
  shownRank: number,
  nextGeneration: number,
) {
  const settings = useSettingsStore.getState();
  if (!settings.networkEnabled || !settings.apiConfig) return null;
  const { above, below } = neighborRanks(shownRank, `${goalId}:${nextGeneration}`);
  const snapshot = buildKnowledgeSnapshot(
    context.closureNodeIds,
    context.planner.nodes,
    context.goalMasteryByNode,
    LIT_THRESHOLD,
  );
  const result = await requestLadderGeneration(settings.apiConfig, {
    goalTitle: context.goal.title,
    learnedItems: snapshot.learnedItems,
    notYetLabels: snapshot.notYetLabels,
  });
  const validated = validateLadderGeneration(result);
  if (validated === null) {
    void recordAiFailure("ladder", new Error("generation failed validation (<3 usable figures)"));
    return null;
  }
  return buildLadderFigureRows(
    goalId,
    nextGeneration,
    validated,
    [...above, ...below],
    newId,
    nowIso,
  );
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
      const context = rankContext(goalId);
      if (context === null) {
        set({ loading: false });
        return;
      }
      const repos = await getRepos();
      const [state, storedFigures] = await Promise.all([
        repos.goalLadders.getState(goalId),
        repos.goalLadders.listFigures(goalId),
      ]);
      const history =
        state !== null && state.last_shown_rank !== null && state.last_view_fuel !== null
          ? { lastShownRank: state.last_shown_rank, lastViewFuel: state.last_view_fuel }
          : null;
      const shownRank = resolveShownRank(context.fuel, startRank(goalId), history);
      const rankDelta = history === null ? null : history.lastShownRank - shownRank;

      let generation = state?.generation ?? 0;
      let nextRefreshAt = state?.next_refresh_at ?? null;
      let figures = storedFigures;
      if (isRefreshDue(nextRefreshAt, nowIso()) || figures.length === 0) {
        const fresh = await regenerateBoard(context, goalId, shownRank, generation + 1);
        if (fresh !== null) {
          await repos.goalLadders.replaceFigures(goalId, fresh);
          generation += 1;
          nextRefreshAt = nextRefreshAtIso(nowIso(), `${goalId}:${generation}`);
          figures = fresh;
        }
      }

      const nextState: GoalLadderStateRow = {
        goal_id: goalId,
        last_shown_rank: shownRank,
        last_view_fuel: context.fuel,
        // No board yet (e.g. offline): stay permanently due so the next opportunity generates.
        next_refresh_at: nextRefreshAt ?? new Date(0).toISOString(),
        generation,
        updated_at: nowIso(),
      };
      await repos.goalLadders.upsertState(nextState);

      set({
        loading: false,
        failed: false,
        ladder: {
          goalId,
          userRank: shownRank,
          rankDelta,
          rows: buildLadderDisplayRows(figures, shownRank),
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
      const context = rankContext(goalId);
      if (context === null) return;
      const repos = await getRepos();
      const state = await repos.goalLadders.getState(goalId);
      if (state === null || !isRefreshDue(state.next_refresh_at, nowIso())) return;
      const history =
        state.last_shown_rank !== null && state.last_view_fuel !== null
          ? { lastShownRank: state.last_shown_rank, lastViewFuel: state.last_view_fuel }
          : null;
      const shownRank = resolveShownRank(context.fuel, startRank(goalId), history);
      const fresh = await regenerateBoard(context, goalId, shownRank, state.generation + 1);
      if (fresh === null) return;
      await repos.goalLadders.replaceFigures(goalId, fresh);
      await repos.goalLadders.upsertState({
        ...state,
        next_refresh_at: nextRefreshAtIso(nowIso(), `${goalId}:${state.generation + 1}`),
        generation: state.generation + 1,
        updated_at: nowIso(),
      });
    } catch (error) {
      void recordAiFailure("ladder", error);
    }
  },
}));
