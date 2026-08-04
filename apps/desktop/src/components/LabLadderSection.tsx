/**
 * Purpose: lab-panel "排位" collapsed section (spec 016) — shown only in ranked mode. Auto-
 * evaluates the ladder once per section mount per selected goal (this render IS the user's
 * active viewing, 2026-08-04: the old "看看同行者" button is gone), showing a shimmering
 * skeleton while loading and a quiet retry state on failure. Copy uses only game-industry-plain
 * words ("目标进度 N%", a leaderboard, a non-pressuring hook line) — never the old invented
 * "里程/纵深" band vocabulary, which stays internal to milestone.ts.
 * Main exports: LabLadderSection.
 */
import { useEffect } from "react";
import type { LadderDisplayRow } from "../lib/ladderActions";
import { useLadderStore } from "../stores/ladderStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

function LadderSkeleton() {
  return (
    <ul className="space-y-1" aria-label="排行榜加载中">
      {[0, 1, 2].map((index) => (
        <li key={index} className="h-5 animate-pulse rounded bg-stone-100" />
      ))}
    </ul>
  );
}

function GoalProgressBar({ value }: { value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-stone-600">目标进度 {value}%</p>
      <div className="h-2 overflow-hidden rounded bg-stone-100">
        <div
          className="h-full rounded bg-amber-500 transition-[width]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/** "下一个：{谁}（M%）——还差 {M-N}%" — attracts without pressure: no countdown, no "落后"
 * wording. The row immediately above the user's in the milestone-sorted list is the nearest
 * target; topping the board gets a plain, praise-free line instead. */
function LadderHookLine({
  rows,
  userMilestone,
}: {
  rows: LadderDisplayRow[];
  userMilestone: number;
}) {
  const userIndex = rows.findIndex((row) => row.isUser);
  const above = userIndex > 0 ? rows[userIndex - 1] : undefined;
  if (above === undefined) {
    return <p className="text-stone-400">这条路上，前面已经没有人了</p>;
  }
  return (
    <p className="text-stone-400">
      下一个：{above.label}（{above.milestoneValue}%）——还差 {above.milestoneValue - userMilestone}%
    </p>
  );
}

export function LabLadderSection() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const ladder = useLadderStore((state) => state.ladder);
  const loading = useLadderStore((state) => state.loading);
  const failed = useLadderStore((state) => state.failed);
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
          <p className="text-stone-400">先选一个目标，排行榜就会自己出现</p>
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
            <div className="space-y-2">
              <GoalProgressBar value={ladder.milestone} />
              <ul className="space-y-0.5">
                {ladder.rows.map((row) => (
                  <li
                    key={`${row.label}-${row.milestoneValue}`}
                    className={`flex items-center justify-between gap-2 rounded px-1 ${
                      row.isUser ? "bg-amber-100 text-stone-700" : "text-stone-500"
                    }`}
                  >
                    {row.isUser ? (
                      <span className="font-medium">你 · {row.milestoneValue}%</span>
                    ) : (
                      <>
                        <span>
                          <span className="font-medium text-stone-700">{row.label}</span>
                          {row.note && <span className="ml-1 text-stone-400">{row.note}</span>}
                        </span>
                        <span className="shrink-0 text-stone-400">{row.milestoneValue}%</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <LadderHookLine rows={ladder.rows} userMilestone={ladder.milestone} />
            </div>
          )
        )}
      </div>
    </details>
  );
}
