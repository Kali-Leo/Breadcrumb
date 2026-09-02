/**
 * Purpose: shared helpers for the research statistic functions (spec 036) — local calendar
 * day-bucketing, equal-width histogram binning, Pearson correlation, and the one thin per-day
 * SQL fetch correlation reuses for both series. Bucket labels leave as catalogue keys: this
 * package writes no wording (spec 058 §2).
 * Main exports: localDateKey, buildDayKeys, windowStartIso, countsByLocalDay,
 * fetchDailyCounts, buildEqualWidthHistogram, buildWeekdayHistogram, pearsonCorrelation,
 * roundTo3.
 */
import type { SqlClient } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { StatCall } from "./taskSchema";

const DAILY_METRIC_TABLE: Record<Extract<StatCall, { fn: "correlation" }>["xMetric"], string> = {
  daily_encounters: "node_sightings",
  daily_word_events: "diglot_word_events",
  daily_messages: "messages",
};

/** Fetches one correlation series' raw per-day counts: every row in the metric's table with
 * `created_at >= sinceIso`, bucketed into the given local-day keys. */
export async function fetchDailyCounts(
  metric: Extract<StatCall, { fn: "correlation" }>["xMetric"],
  sql: SqlClient,
  dayKeys: readonly string[],
  sinceIso: string,
): Promise<number[]> {
  const table = DAILY_METRIC_TABLE[metric];
  const rows = await sql.select<{ created_at: string }>(
    `SELECT created_at FROM ${table} WHERE created_at >= ?`,
    [sinceIso],
  );
  return countsByLocalDay(
    rows.map((row) => row.created_at),
    dayKeys,
  );
}

/** Local calendar date key for an ISO instant, matching the feedback lab's day-cutting rule
 * (activity.ts) — days are cut by the machine's local timezone, not UTC. */
export function localDateKey(iso: string): string {
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

/** Full local-day key sequence from (now - windowDays + 1) to now inclusive. */
export function buildDayKeys(windowDays: number, nowIso: string): string[] {
  const todayKey = localDateKey(nowIso);
  const keys: string[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    keys.push(shiftDateKey(todayKey, -offset));
  }
  return keys;
}

/** Start-of-local-day ISO instant for the earliest day in a windowDays range — the SQL lower
 * bound for a "last N days" query. */
export function windowStartIso(windowDays: number, nowIso: string): string {
  const earliestKey = buildDayKeys(windowDays, nowIso)[0] ?? localDateKey(nowIso);
  const [year, month, day] = earliestKey.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** Counts timestamps into the given local-day buckets, in day-key order. */
export function countsByLocalDay(
  timestampsIso: readonly string[],
  dayKeys: readonly string[],
): number[] {
  const countByDate = new Map<string, number>();
  for (const iso of timestampsIso) {
    const key = localDateKey(iso);
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  }
  return dayKeys.map((key) => countByDate.get(key) ?? 0);
}

/** Pearson correlation coefficient between two equal-length series; 0 (not NaN) when either
 * series has zero variance. */
export function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let sumSquaresX = 0;
  let sumSquaresY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    const dy = (ys[index] ?? 0) - meanY;
    numerator += dx * dy;
    sumSquaresX += dx * dx;
    sumSquaresY += dy * dy;
  }
  const denominator = Math.sqrt(sumSquaresX * sumSquaresY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Rounds to 3 decimal places — the precision correlation coefficients leave the call at. */
export function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Equal-width histogram over `values`, split into `bucketCount` buckets spanning `domain`
 * (or the data's own [min, max] when omitted). Every bucket is kept, including the empty
 * ones: results here are only ever shown on the machine that computed them, so dropping
 * small buckets bought no privacy and cost the picture its arithmetic — the bars stopped
 * summing to the count printed next to them (审计统计分报告差距 4). The disclosure floor
 * belongs on a future upload path, not on the local display path.
 */
export function buildEqualWidthHistogram(
  values: readonly number[],
  bucketCount: number,
  domain?: readonly [number, number],
): Array<{ label: CopyMessage; value: number }> {
  if (values.length === 0) return [];
  const min = domain?.[0] ?? Math.min(...values);
  const max = domain?.[1] ?? Math.max(...values);
  const width = max - min;
  const counts = new Array<number>(bucketCount).fill(0);
  for (const value of values) {
    const rawIndex = width === 0 ? 0 : Math.floor(((value - min) / width) * bucketCount);
    const index = Math.min(bucketCount - 1, Math.max(0, rawIndex));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const bars: Array<{ label: CopyMessage; value: number }> = [];
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const low = width === 0 ? min : min + (width * bucketIndex) / bucketCount;
    const high = width === 0 ? max : min + (width * (bucketIndex + 1)) / bucketCount;
    bars.push({
      label: {
        key: "settings:research.barRange",
        params: { low: low.toFixed(2), high: high.toFixed(2) },
      },
      value: counts[bucketIndex] ?? 0,
    });
  }
  return bars;
}

/** Sunday-first, matching JS `getDay()`. */
const WEEKDAY_KEYS = [
  "settings:research.weekdaySunday",
  "settings:research.weekdayMonday",
  "settings:research.weekdayTuesday",
  "settings:research.weekdayWednesday",
  "settings:research.weekdayThursday",
  "settings:research.weekdayFriday",
  "settings:research.weekdaySaturday",
] as const;

/** Fixed 7-category local-weekday histogram; all seven days are always shown, a quiet day
 * being a fact about the week rather than something to hide. */
export function buildWeekdayHistogram(
  timestampsIso: readonly string[],
): Array<{ label: CopyMessage; value: number }> {
  const counts = new Array<number>(7).fill(0);
  for (const iso of timestampsIso) {
    const weekday = new Date(iso).getDay();
    counts[weekday] = (counts[weekday] ?? 0) + 1;
  }
  return WEEKDAY_KEYS.map((key, weekday) => ({
    label: { key },
    value: counts[weekday] ?? 0,
  }));
}
