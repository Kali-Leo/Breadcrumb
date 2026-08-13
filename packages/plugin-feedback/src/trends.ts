/**
 * Purpose: longitudinal trend lines for the feedback lab's "趋势" module (spec 035 T6) —
 * cumulative concepts and summed retrievability, one point per local day; never a
 * daily-accuracy line (Soderstrom & Bjork 2015 — see the trend research doc).
 * Main exports: TrendPoint, TREND_WINDOW_DAYS, computeCumulativeConceptSeries,
 * computeKnowledgeSumSeries, computeWordSeenSeries.
 */
import type { DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { computeRetentionSumSeries } from "@breadcrumb/plugin-memory";
import { cumulativeByDay, dateKeyRange, localDayEndIso } from "./trendDays";

export interface TrendPoint {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  value: number;
}

/** Trend window: ~90 days (a season) is far enough back to read a shape without the chart
 * flattening out, while cumulative lines still carry whatever was built up before the
 * window instead of misleadingly starting at 0. */
export const TREND_WINDOW_DAYS = 90;

/** Cumulative distinct concepts met, by each node's first-sighting day — strictly
 * never-decreasing, and the first point already carries every sighting before the window. */
export function computeCumulativeConceptSeries(
  sightings: readonly NodeSightingRow[],
  options: { days: number; todayIso: string },
): TrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const firstSightingMsByNode = new Map<string, number>();
  for (const sighting of sightings) {
    const ms = Date.parse(sighting.created_at);
    const existing = firstSightingMsByNode.get(sighting.node_id);
    if (existing === undefined || ms < existing) firstSightingMsByNode.set(sighting.node_id, ms);
  }
  const sortedFirstSightings = [...firstSightingMsByNode.values()].sort((a, b) => a - b);
  const counts = cumulativeByDay(sortedFirstSightings, dateKeys);
  return dateKeys.map((date, index) => ({ date, value: counts[index] ?? 0 }));
}

/** Sum of every node's FSRS retrievability at each local day's end — plugin-memory owns the
 * FSRS semantics (computeRetentionSumSeries); this just samples it once per day and rounds
 * for display. Non-decreasing is not guaranteed (retrievability decays between reviews),
 * but the curve is smooth: literature calls this "estimated total knowledge". */
export function computeKnowledgeSumSeries(
  sightings: readonly NodeSightingRow[],
  options: { days: number; todayIso: string },
): TrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const sampleInstantsIso = dateKeys.map((dateKey) => localDayEndIso(dateKey));
  const sums = computeRetentionSumSeries(sightings, sampleInstantsIso);
  return dateKeys.map((date, index) => ({
    date,
    value: Math.round((sums[index] ?? 0) * 10) / 10,
  }));
}

/** Cumulative distinct woven words ever introduced, by `introduced_at` day — strictly
 * never-decreasing. */
export function computeWordSeenSeries(
  states: readonly DiglotWordStateRow[],
  options: { days: number; todayIso: string },
): TrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const sortedIntroductions = states
    .map((state) => Date.parse(state.introduced_at))
    .sort((a, b) => a - b);
  const counts = cumulativeByDay(sortedIntroductions, dateKeys);
  return dateKeys.map((date, index) => ({ date, value: counts[index] ?? 0 }));
}
