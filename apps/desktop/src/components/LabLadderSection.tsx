/**
 * Purpose: lab-panel "排位" collapsed section (spec 021) — shown only in ranked mode. Displays
 * the learner's own title (no rank numbers, no other people): the current title large, a plain
 * "上次看的时候是 X" line when it changed (same sentence up or down, no alarm color), and a
 * "下一个称号" hook line. Re-evaluates once per mount per selected goal; computation is pure
 * local, so there is no loading or failure state.
 * Main exports: LabLadderSection.
 */
import { useEffect } from "react";
import { useLadderStore } from "../stores/ladderStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

export function LabLadderSection() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const ladder = useLadderStore((state) => state.ladder);
  const viewLadder = useLadderStore((state) => state.viewLadder);

  // Evaluated once per section mount per goal: selectedGoalId/learningMode are the only
  // triggers, so the frequent store recomputes (mastery/edges/interest events) that don't
  // change either one never re-fire this — no refresh loop.
  useEffect(() => {
    if (learningMode !== "ranked" || selectedGoalId === null) return;
    void viewLadder(selectedGoalId);
  }, [learningMode, selectedGoalId, viewLadder]);

  if (learningMode !== "ranked") return null;

  return (
    <details className="rounded border border-stone-200" open>
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">排位</summary>
      <div className="space-y-2 border-t border-stone-100 px-2 py-1">
        {selectedGoalId === null ? (
          <p className="text-stone-400">先选一个目标，称号就会自己出现</p>
        ) : (
          ladder &&
          ladder.goalId === selectedGoalId && (
            <div className="space-y-0.5">
              <p className="text-2xl font-semibold text-stone-700">{ladder.title.label}</p>
              {ladder.previousTitleLabel !== null && (
                <p className="text-stone-400">上次看的时候是 {ladder.previousTitleLabel}</p>
              )}
              {ladder.nextTitleLabel !== null && (
                <p className="text-stone-400">下一个称号：{ladder.nextTitleLabel}</p>
              )}
            </div>
          )
        )}
      </div>
    </details>
  );
}
