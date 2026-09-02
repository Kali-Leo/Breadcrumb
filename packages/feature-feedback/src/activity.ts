/**
 * Purpose: heatmap data (per-day footprint counts, local calendar days) and continuity
 * streak stats for the feedback lab's "学习热力图" module (spec 035 #1).
 * Main exports: DailyActivityCell, computeDailyActivity, computeContinuity, toLocalDateKey.
 */

export interface DailyActivityCell {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  count: number;
}

/** Local calendar date key for an ISO instant — cuts days by the machine's local timezone,
 * matching what the heatmap visually represents to the person looking at it. Every day-cutting
 * consumer in this package reads it from here, so "which day is this" is decided once. */
export function toLocalDateKey(iso: string): string {
  const instant = new Date(iso);
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Adds (or subtracts) whole days to a local date key. */
function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + deltaDays);
  const shiftedYear = shifted.getFullYear();
  const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

/** Full local-day sequence from (today - days + 1) to today inclusive, every day present
 * even with zero events — the heatmap component needs a complete, gap-free range. */
export function computeDailyActivity(
  eventTimesIso: readonly string[],
  options: { days: number; todayIso: string },
): DailyActivityCell[] {
  const { days, todayIso } = options;
  const todayKey = toLocalDateKey(todayIso);

  const countByDate = new Map<string, number>();
  for (const eventTimeIso of eventTimesIso) {
    const dateKey = toLocalDateKey(eventTimeIso);
    countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
  }

  const cells: DailyActivityCell[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDateKey(todayKey, -offset);
    cells.push({ date, count: countByDate.get(date) ?? 0 });
  }
  return cells;
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
