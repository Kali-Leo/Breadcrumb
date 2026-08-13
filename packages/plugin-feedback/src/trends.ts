/**
 * Purpose: longitudinal trend lines for the feedback lab's "趋势" module (spec 035 T7a) —
 * the three-layer knowledge estimate (memory / understanding / intuition), one point per
 * local day; never a daily-accuracy line (Soderstrom & Bjork 2015 — see the trend research
 * doc).
 * Main exports: TrendPoint, TREND_WINDOW_DAYS, LayerTrendPoint, computeLayerTrendSeries.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { computeKnowledgeLayerSeries } from "@breadcrumb/plugin-memory";
import { dateKeyRange, localDayEndIso } from "./trendDays";

export interface TrendPoint {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  value: number;
}

/** Trend window: ~90 days (a season) is far enough back to read a shape without the chart
 * flattening out, while cumulative lines still carry whatever was built up before the
 * window instead of misleadingly starting at 0. */
export const TREND_WINDOW_DAYS = 90;

export interface LayerTrendPoint {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  memory: number;
  understanding: number;
  intuition: number;
}

/** One point per local day's end for the three-layer estimate — plugin-memory owns the
 * layer semantics (computeKnowledgeLayerSeries); this just samples it once per day and
 * rounds every layer to one decimal for display. */
export function computeLayerTrendSeries(input: {
  sightings: readonly NodeSightingRow[];
  claims: readonly MasteryClaimRow[];
  productiveUseTimesByNode: ReadonlyMap<string, readonly string[]>;
  days: number;
  todayIso: string;
}): LayerTrendPoint[] {
  const dateKeys = dateKeyRange(input.days, input.todayIso);
  const sampleInstantsIso = dateKeys.map((dateKey) => localDayEndIso(dateKey));
  const points = computeKnowledgeLayerSeries({
    sightings: input.sightings,
    claims: input.claims,
    productiveUseTimesByNode: input.productiveUseTimesByNode,
    sampleInstantsIso,
  });
  return dateKeys.map((date, index) => {
    const point = points[index];
    return {
      date,
      memory: Math.round((point?.memory ?? 0) * 10) / 10,
      understanding: Math.round((point?.understanding ?? 0) * 10) / 10,
      intuition: Math.round((point?.intuition ?? 0) * 10) / 10,
    };
  });
}
