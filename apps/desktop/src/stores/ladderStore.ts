/**
 * Purpose: zustand store driving the ranked ladder's self-title view (spec 021) — viewLadder()
 * resolves the internal rank scalar (never worse while the learner keeps learning, bounded
 * slip-back after long absence), maps it to the learner's own title, and remembers what was
 * shown so the next view can state a title change plainly. Pure local computation: no LLM,
 * no network, no other people.
 * Main exports: useLadderStore, LadderView.
 */
import {
  domainFuel,
  goalDomainClosure,
  type LadderTitle,
  nextTitleLabel,
  resolveShownRank,
  startRank,
  titleFromRank,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { masteryAsSeenByGoal } from "../lib/plannerGapActions";
import { nowIso } from "../lib/time";
import { usePlannerStore } from "./plannerStore";
import { useSettingsStore } from "./settingsStore";

export interface LadderView {
  goalId: string;
  title: LadderTitle;
  /** The title label the learner saw last view when it differs from the current one, else
   * null — drives the plain "上次看的时候是 X" line (same sentence up or down). */
  previousTitleLabel: string | null;
  /** One step up — the hook line's target; null when already at the top. */
  nextTitleLabel: string | null;
}

interface LadderState {
  ladder: LadderView | null;
  viewLadder(goalId: string): Promise<void>;
}

/** The learner's rank context for one goal, recomputed fresh from planner state every call. */
function rankContext(goalId: string) {
  const planner = usePlannerStore.getState();
  const goal = planner.goals.find((candidate) => candidate.id === goalId);
  if (goal === undefined) return null;
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  const goalMasteryByNode = masteryAsSeenByGoal(planner.masteryByNode, planner.claims);
  const closureNodeIds = goalDomainClosure(planner.edges, goalNodeIds);
  return domainFuel(closureNodeIds, goalMasteryByNode);
}

export const useLadderStore = create<LadderState>((set) => ({
  ladder: null,

  async viewLadder(goalId) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.labPanel) return; // reuses the lab-panel switch (spec 016)

    try {
      const fuel = rankContext(goalId);
      if (fuel === null) return;
      const repos = await getRepos();
      const state = await repos.goalLadders.getState(goalId);
      const history =
        state === null
          ? null
          : { lastShownRank: state.last_shown_rank, lastViewFuel: state.last_view_fuel };
      const goalStartRank = startRank(goalId);
      const shownRank = resolveShownRank(fuel, goalStartRank, history);
      const title = titleFromRank(shownRank, goalStartRank);
      const previousTitle =
        history === null ? null : titleFromRank(history.lastShownRank, goalStartRank);

      await repos.goalLadders.upsertState({
        goal_id: goalId,
        last_shown_rank: shownRank,
        last_view_fuel: fuel,
        updated_at: nowIso(),
      });

      set({
        ladder: {
          goalId,
          title,
          previousTitleLabel:
            previousTitle !== null && previousTitle.label !== title.label
              ? previousTitle.label
              : null,
          nextTitleLabel: nextTitleLabel(title),
        },
      });
    } catch (error) {
      console.warn("ladder view skipped:", error);
    }
  },
}));
