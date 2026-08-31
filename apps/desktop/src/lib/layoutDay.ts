/**
 * Purpose: the palace layout's daily rhythm (Leo 2026-08-31) — island size and centrality
 * refresh once per local day, so browsing never moves the map mid-day. This module only
 * answers "when did today start" and "which rows existed before then"; the layout itself
 * consumes the answers.
 * Main exports: startOfLocalDayIso, rowsBeforeDay.
 */

/** Local midnight of the given moment, as the UTC ISO string node/sighting rows use. */
export function startOfLocalDayIso(now: Date = new Date()): string {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart.toISOString();
}

/** Keeps only rows created before the layout day — today's activity waits for tomorrow. */
export function rowsBeforeDay<Row extends { created_at: string }>(
  rows: readonly Row[],
  dayStartIso: string,
): Row[] {
  return rows.filter((row) => row.created_at < dayStartIso);
}
