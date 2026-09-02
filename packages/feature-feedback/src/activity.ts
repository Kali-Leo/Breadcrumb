/**
 * Purpose: heatmap data (per-day footprint counts, local calendar days) and continuity
 * streak stats for the feedback lab's "学习热力图" module (spec 035 #1).
 * Main exports: DailyActivityCell, computeDailyActivity, computeContinuity, toLocalDateKey.
 */
import { dateKeyRange, toLocalDateKey } from "@breadcrumb/core-time";

/** Re-exported so this package's own day-cutting consumers keep one import; the rule itself
 * is @breadcrumb/core-time's, shared with the research lab and the trail (2026-09-02 — the
 * three used to hold byte-identical copies kept in sync by comments). */
export { toLocalDateKey };

export interface DailyActivityCell {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  count: number;
}

/** Full local-day sequence from (today - days + 1) to today inclusive, every day present
 * even with zero events — the heatmap component needs a complete, gap-free range. */
export function computeDailyActivity(
  eventTimesIso: readonly string[],
  options: { days: number; todayIso: string },
): DailyActivityCell[] {
  const { days, todayIso } = options;

  const countByDate = new Map<string, number>();
  for (const eventTimeIso of eventTimesIso) {
    const dateKey = toLocalDateKey(eventTimeIso);
    countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
  }

  return dateKeyRange(days, todayIso).map((date) => ({
    date,
    count: countByDate.get(date) ?? 0,
  }));
}

/** Active-day count, longest connected active run, and the run ending today (or ending
 * yesterday, if today has no activity yet) — never a "days since last activity" figure. */
export function computeContinuity(cells: readonly DailyActivityCell[]): {
  activeDays: number;
  longestRunDays: number;
  currentRunDays: number;
} {
  let activeDays = 0;
  let longestRunDays = 0;
  let runningRun = 0;
  for (const cell of cells) {
    if (cell.count > 0) {
      activeDays += 1;
      runningRun += 1;
      longestRunDays = Math.max(longestRunDays, runningRun);
    } else {
      runningRun = 0;
    }
  }

  let currentRunDays = 0;
  const lastIndex = cells.length - 1;
  const today = lastIndex >= 0 ? cells[lastIndex] : undefined;
  const yesterday = lastIndex >= 1 ? cells[lastIndex - 1] : undefined;
  const runEndIndex =
    today !== undefined && today.count > 0
      ? lastIndex
      : yesterday !== undefined && yesterday.count > 0
        ? lastIndex - 1
        : -1;
  for (let index = runEndIndex; index >= 0; index -= 1) {
    const cell = cells[index];
    if (cell === undefined || cell.count === 0) break;
    currentRunDays += 1;
  }

  return { activeDays, longestRunDays, currentRunDays };
}
