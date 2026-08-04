/**
 * Purpose: zustand store driving the ranked ladder (spec 018) — fetch-on-view only.
 * viewLadder() computes the learner's own rank via rankEngine, decides reuse vs regenerate via
 * planLadderRefresh, calls the ladder-generation LLM only when that decision says "generate",
 * and persists the result. Never auto-refreshes on recompute — the lab panel's 排位 section
 * triggers this itself, once per section mount per goal, treating that render as the user's
 * active viewing (2026-08-04 revision: the old "看看同行者" button is gone).
 * Main exports: useLadderStore, LadderView.
 */
import type { GoalLadderRow } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  domainFuel,
  goalDomainClosure,
  neighborRanks,
  planLadderRefresh,
  progressFromFuel,
  rankFromProgress,
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

/** Up to 10 lit domain labels ground the generation prompt (spec 016 #3, unchanged by 018). */
const DOMAIN_LABEL_SAMPLE_SIZE = 10;
/** Exactly this many famous figures is the target split (spec 018 #3) — deviation is logged,
 * never a hard failure. */
const EXPECTED_FAMOUS_COUNT = 2;

export interface LadderView {
  goalId: string;
  userRank: number;
  /** The learner's current progress value m (0..~100, asymptotic) — the exact position the
   * displayed rank was rounded from. Carried through so the UI progress bar can show a
   * within-rank fraction (rankProgressFraction in ladderActions.ts) instead of a coarse
   * "just entered this rank" 0%. */
  progress: number;
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
  return { userRankAtGeneration: first.user_rank_at_generation };
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
      // Same goal-view-boosted mastery coverage() uses — the ladder must never disagree with it.
      const goalMasteryByNode = masteryAsSeenByGoal(planner.masteryByNode, planner.claims);
      const closureNodeIds = goalDomainClosure(planner.edges, goalNodeIds);
      const fuel = domainFuel(closureNodeIds, goalMasteryByNode);
      const m = progressFromFuel(fuel, closureNodeIds.length);
      const currentUserRank = rankFromProgress(m);

      const repos = await getRepos();
      const [storedRows, shownRows] = await Promise.all([
        repos.goalLadders.listForGoal(goalId),
        repos.goalLadders.listShownIdentities(goalId),
      ]);

      const action = planLadderRefresh(toStoredLadder(storedRows), currentUserRank);
      let displayRows: readonly GoalLadderRow[] = storedRows;

      if (action === "generate" && settings.networkEnabled && settings.apiConfig) {
        const forbiddenIdentities = shownRows.map((row) => row.identity);
        const { above, below } = neighborRanks(currentUserRank);
        const slotRanks = [...above, ...below];
        const result = await requestLadderGeneration(settings.apiConfig, {
          goalTitle: goal.title,
          domainLabelsSample: pickDomainLabelsSample(
            goalNodeIds,
            planner.nodes,
            goalMasteryByNode,
            LIT_THRESHOLD,
            DOMAIN_LABEL_SAMPLE_SIZE,
          ),
          forbiddenIdentities,
        });
        const validated = validateLadderGeneration(result, forbiddenIdentities);
        if (validated !== null) {
          const famousCount = validated.filter((figure) => figure.isFamous).length;
          if (famousCount !== EXPECTED_FAMOUS_COUNT) {
            void recordAiFailure(
              "ladder",
              new Error(
                `famous split ${famousCount}/${validated.length - famousCount} (expected ${EXPECTED_FAMOUS_COUNT}/${validated.length - EXPECTED_FAMOUS_COUNT})`,
              ),
            );
          }
          const nextGeneration = (storedRows[0]?.generation ?? 0) + 1;
          const rows = buildLadderRows(
            goalId,
            nextGeneration,
            currentUserRank,
            validated,
            slotRanks,
            newId,
            nowIso,
          );
          await repos.goalLadders.replaceForGoal(goalId, rows);
          await repos.goalLadders.recordShownIdentities(
            goalId,
            rows.map((row) => `${row.name}|${row.era}`),
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
          userRank: currentUserRank,
          progress: m,
          rows: buildLadderDisplayRows(displayRows, currentUserRank),
        },
      });
    } catch (error) {
      console.warn("ladder view skipped:", error);
      void recordAiFailure("ladder", error);
      set({ loading: false, failed: true });
    }
  },
}));
