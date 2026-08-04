/**
 * Purpose: lab-panel "排位" collapsed section (spec 018) — shown only in ranked mode. Auto-
 * evaluates the ladder once per section mount per selected goal (this render IS the user's
 * active viewing, 2026-08-04: the old "看看同行者" button is gone), showing a shimmering
 * skeleton while loading and a quiet retry state on failure. Copy uses only通用语言 ("第 N 名",
 * a leaderboard, a non-pressuring hook line) — never invented jargon, and never "生成/AI/模拟"
 * wording (注意力设计手册 硬规矩 #1 #2).
 * Main exports: LabLadderSection.
 */
import { useEffect } from "react";
import type { LadderDisplayRow } from "../lib/ladderActions";
import { rankProgressFraction } from "../lib/ladderActions";
import { useLadderStore } from "../stores/ladderStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

function LadderSkeleton() {
  return (
    <ul className="space-y-1" aria-label="排行榜加载中">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <li key={index} className="h-5 animate-pulse rounded bg-stone-100" />
      ))}
    </ul>
  );
}

/** "第 N 名" large + a thin progress-to-next-rank bar — no percentage label, no jargon, just
 * a log-feel sliver that visibly slows down at higher ranks (rankProgressFraction). */
function LadderHeader({ userRank, progress }: { userRank: number; progress: number }) {
  const fraction = rankProgressFraction(progress, userRank);
  return (
    <div className="space-y-1">
      <p className="text-2xl font-semibold text-stone-700">第 {userRank.toLocaleString()} 名</p>
      <div className="h-1.5 overflow-hidden rounded bg-stone-100">
        <div
          className="h-full rounded bg-amber-500 transition-[width]"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

/** One compact row: 名字 · 年龄岁 · 年代 · 职业，右对齐第N名。Hovering (CSS-only, so the
 * card appears the instant the pointer lands, well inside the手册's 100ms feedback rule) shows
 * a floating selfLine card. The user's own row never gets a card — there is no selfLine for
 * "你" to reveal. */
function LadderRow({ row }: { row: LadderDisplayRow }) {
  if (row.isUser) {
    return (
      <li className="flex items-center justify-between gap-2 rounded bg-amber-100 px-2 py-1 text-stone-700">
        <span className="font-medium">你</span>
        <span className="shrink-0 font-medium">第 {row.rank.toLocaleString()} 名</span>
      </li>
    );
  }
  return (
    <li className="group relative flex items-center justify-between gap-2 rounded px-2 py-1 text-stone-500 hover:bg-stone-50">
      <span className="truncate">
        <span className="font-medium text-stone-700">{row.name}</span>
        <span className="ml-1 text-stone-400">
          {row.age} 岁 · {row.era} · {row.occupation}
        </span>
      </span>
      <span className="shrink-0 text-stone-400">第 {row.rank.toLocaleString()} 名</span>
      {row.selfLine && (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 w-64 rounded border border-stone-200 bg-white p-2 text-stone-600 opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
          {row.selfLine}
        </div>
      )}
    </li>
  );
}

/** "下一个：{name}（第 M 名）" — attracts without pressure: no countdown, no "落后" wording.
 * The row immediately above the user's in the rank-sorted list is the nearest target; topping
 * the board gets a plain, praise-free line instead. */
function LadderHookLine({ rows }: { rows: LadderDisplayRow[] }) {
  const userIndex = rows.findIndex((row) => row.isUser);
  const above = userIndex > 0 ? rows[userIndex - 1] : undefined;
  if (above === undefined) {
    return <p className="text-stone-400">这条路上，前面已经没有人了</p>;
  }
  return (
    <p className="text-stone-400">
      下一个：{above.name}（第 {above.rank.toLocaleString()} 名）
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
              <LadderHeader userRank={ladder.userRank} progress={ladder.progress} />
              <ul className="space-y-0.5">
                {ladder.rows.map((row) => (
                  <LadderRow key={`${row.name}-${row.rank}`} row={row} />
                ))}
              </ul>
              <LadderHookLine rows={ladder.rows} />
            </div>
          )
        )}
      </div>
    </details>
  );
}
