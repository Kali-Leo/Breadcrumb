/**
 * Purpose: local-day bucketing shared by the feedback lab's trend series (spec 035 T6) —
 * turns a day count plus "now" into the local calendar date sequence each series samples.
 * Main exports: dateKeyRange, localDayEndIso, cumulativeByDay.
 */

/** Local calendar date key for an ISO instant, matching activity.ts's day-cutting rule. */
function toLocalDateKey(iso: string): string {
  const instant = new Date(iso);
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The last instant of a local calendar day, as an ISO string — the sampling point each
 * series uses so "today's value" reflects everything that happened today. */
export function localDayEndIso(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

/** Full local-day sequence from (today - days + 1) to today inclusive. */
export function dateKeyRange(days: number, todayIso: string): string[] {
  const todayKey = toLocalDateKey(todayIso);
  const [year, month, day] = todayKey.split("-").map(Number) as [number, number, number];
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const shifted = new Date(year, month - 1, day);
    shifted.setDate(shifted.getDate() - offset);
    const shiftedYear = shifted.getFullYear();
    const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, "0");
    const shiftedDay = String(shifted.getDate()).padStart(2, "0");
    keys.push(`${shiftedYear}-${shiftedMonth}-${shiftedDay}`);
  }
  return keys;
}

/** Cumulative count of `sortedInstantMs` at-or-before each local day's end — the shared
 * shape behind every never-decreasing trend series (concepts met, words seen). */
export function cumulativeByDay(
  sortedInstantMs: readonly number[],
  dateKeys: readonly string[],
): number[] {
  const counts: number[] = [];
  let pointer = 0;
  let cumulative = 0;
  for (const dateKey of dateKeys) {
    const dayEndMs = Date.parse(localDayEndIso(dateKey));
    let nextInstantMs = sortedInstantMs[pointer];
    while (nextInstantMs !== undefined && nextInstantMs <= dayEndMs) {
      cumulative += 1;
      pointer += 1;
      nextInstantMs = sortedInstantMs[pointer];
    }
    counts.push(cumulative);
  }
  return counts;
}
