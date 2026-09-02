/**
 * Purpose: the read side of the daily trail summary — the last week's sentences for the
 * 「这段时间」 card, and the day-labelling rule the card uses ("yesterday" or a date).
 * Main exports: TRAIL_SUMMARY_WINDOW_DAYS, loadRecentTrailSummaries, isYesterday.
 */
import type { TrailSummaryRow } from "@breadcrumb/core-db";
import { localDateString, localDayRange } from "@breadcrumb/feature-trail";
import { getRepos } from "../platform/db";

/** How far back the card looks. Seven days: a week is a span a learner can picture without
 * counting, and older sentences stop being "these days". */
export const TRAIL_SUMMARY_WINDOW_DAYS = 7;

/** "YYYY-MM-DD" of the local day `dayOffset` days from now (0 = today, -1 = yesterday). */
function dateKeyOffset(now: Date, dayOffset: number): string {
  return localDateString(new Date(localDayRange(now, dayOffset).fromIso));
}

/** Rows dated within the last TRAIL_SUMMARY_WINDOW_DAYS days, newest first, with any row
 * whose sentence is blank dropped — a blank card line says nothing. */
export async function loadRecentTrailSummaries(now: Date = new Date()): Promise<TrailSummaryRow[]> {
  const repos = await getRepos();
  const rows = await repos.trailSummaries.listSince(dateKeyOffset(now, -TRAIL_SUMMARY_WINDOW_DAYS));
  return rows.filter((row) => row.content.trim() !== "");
}

export function isYesterday(dateKey: string, now: Date = new Date()): boolean {
  return dateKey === dateKeyOffset(now, -1);
}
