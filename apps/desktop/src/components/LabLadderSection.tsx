/**
 * Purpose: lab-panel "排位" collapsed section (spec 022) — shown only in ranked mode. The
 * ladder is a real-time assessment displayed as a board: three rows, no numbers — a state
 * slightly ahead of the learner's, the learner's own 称号 (highlighted, a plain AI summary of
 * what they currently grasp), and a state slightly behind. Shimmering skeleton while the
 * assessment runs, quiet retry on failure, 30-minute background pre-generation while mounted.
 * Main exports: LabLadderSection.
 */
import { useEffect } from "react";
import { useLadderStore } from "../stores/ladderStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

/** How often the mounted section quietly checks whether the board's randomized expiry has
 * passed, pre-generating it so the next actual view is instant (spec 022 §2). */
const PREGENERATE_CHECK_MS = 30 * 60 * 1000;

function LadderSkeleton() {
  return (
    <ul className="space-y-1" aria-label="排位加载中">
      {[0, 1, 2].map((index) => (
        <li key={index} className="h-6 animate-pulse rounded bg-stone-100" />
      ))}
    </ul>
  );
}

export function LabLadderSection() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const ladder = useLadderStore((state) => state.ladder);
  const loading = useLadderStore((state) => state.loading);
  const failed = useLadderStore((state) => state.failed);
  const viewLadder = useLadderStore((state) => state.viewLadder);
  const pregenerateIfDue = useLadderStore((state) => state.pregenerateIfDue);

  // Evaluated once per section mount per goal: selectedGoalId/learningMode are the only
  // triggers, so the frequent store recomputes (mastery/edges/interest events) that don't
  // change either one never re-fire this — no refresh loop.
  useEffect(() => {
    if (learningMode !== "ranked" || selectedGoalId === null) return;
    void viewLadder(selectedGoalId);
  }, [learningMode, selectedGoalId, viewLadder]);

  // Quiet background cadence while the section stays mounted: when the board's randomized
  // expiry passes, pre-generate it so the next actual look is instant (spec 022 §2).
  useEffect(() => {
    if (learningMode !== "ranked" || selectedGoalId === null) return;
    const timer = setInterval(() => void pregenerateIfDue(selectedGoalId), PREGENERATE_CHECK_MS);
    return () => clearInterval(timer);
  }, [learningMode, selectedGoalId, pregenerateIfDue]);

  if (learningMode !== "ranked") return null;

  return (
    <details className="rounded border border-stone-200" open>
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">排位</summary>
      <div className="space-y-2 border-t border-stone-100 px-2 py-1">
        {selectedGoalId === null ? (
          <p className="text-stone-400">先选一个目标，榜就会自己出现</p>
        ) : loading ? (
          <LadderSkeleton />
        ) : failed ? (
          <button
            type="button"
            onClick={() => void viewLadder(selectedGoalId)}
            className="rounded border border-stone-200 px-2 py-1 text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            点一下重试
          </button>
        ) : (
          ladder &&
          ladder.goalId === selectedGoalId && (
            <ul className="space-y-0.5">
              <li className="rounded px-2 py-1 text-stone-500">{ladder.aboveTitle}</li>
              <li className="flex items-center gap-2 rounded bg-amber-100 px-2 py-1 text-stone-700">
                <span className="shrink-0 font-medium">你</span>
                <span>{ladder.selfTitle}</span>
              </li>
              <li className="rounded px-2 py-1 text-stone-500">{ladder.belowTitle}</li>
            </ul>
          )
        )}
      </div>
    </details>
  );
}
