/**
 * Purpose: the palace layout's daily rhythm (Leo 2026-08-31) — island size and centrality
 * refresh once per local day, so browsing never moves the map mid-day. "When did today start"
 * is @breadcrumb/core-time's answer now (2026-09-02), the same one the feedback heatmap and
 * the trail's daily summary cut their days by; this module only adds "which rows existed
 * before then", which is the layout's own question.
 * Main exports: startOfLocalDayIso, rowsBeforeDay.
 */

export { startOfLocalDayIso } from "@breadcrumb/core-time";

/** Keeps only rows created before the layout day — today's activity waits for tomorrow. */
export function rowsBeforeDay<Row extends { created_at: string }>(
  rows: readonly Row[],
  dayStartIso: string,
): Row[] {
  return rows.filter((row) => row.created_at < dayStartIso);
}
