/**
 * Purpose: the mirror modules' sentences that need a decision made in logic — which one
 * applies, and with what values (spec 058 §2). The wording lives in the app's palace.json;
 * nothing here is user-visible text.
 * Main exports: activityMessage, heatmapCellMessage.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

/** Heatmap summary: cumulative active days only — run/streak counts were ruled out (a broken
 * run reads as a whip; the cumulative count keeps investment visible). */
export function activityMessage(activeDays: number): CopyMessage {
  return { key: "palace:mirror.activeDays", params: { count: activeDays } };
}

/** Per-cell hover line for the heatmap — the count is a plain fact, never a target or gap.
 * The date arrives as "YYYY-MM-DD"; formatting it is the app's job, so it is passed through. */
export function heatmapCellMessage(date: string, count: number): CopyMessage {
  return count === 0
    ? { key: "palace:mirror.heatmapCellEmpty", params: { date } }
    : { key: "palace:mirror.heatmapCell", params: { date, count } };
}
