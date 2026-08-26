/**
 * Purpose: geometry for the two emotion curves (fed vs chosen) — turns the service's daily
 * points into SVG coordinates, grid lines and the nearest-point lookup the tooltip needs.
 * Ported from the dashboard the service ships, so the shape on screen stays identical.
 * Main exports: buildEmotionChart, findNearestChartPoint, formatDayLabel.
 */
import type { EmotionPoint, EmotionSeries } from "./schemas";

export const EMOTION_CHART_WIDTH = 860;
export const EMOTION_CHART_HEIGHT = 190;
const PLOT_LEFT = 26;
const PLOT_WIDTH = 780;
const BASELINE_Y = 95;
/** One valence step (of five, from -2 to +2) is 40px tall. */
const VALENCE_UNIT = 40;

export type EmotionSeriesKey = "expose" | "engage";

export interface EmotionChartPoint {
  x: number;
  y: number;
  point: EmotionPoint;
}

export interface EmotionChartLine {
  key: EmotionSeriesKey;
  path: string;
  points: EmotionChartPoint[];
  /** Where the line's own name is drawn, at its right end; null when the line has no points. */
  labelAnchor: { x: number; y: number } | null;
}

export interface EmotionChartGridLine {
  value: number;
  y: number;
  label: string;
  isBaseline: boolean;
}

export interface EmotionChart {
  width: number;
  height: number;
  isEmpty: boolean;
  gridLines: EmotionChartGridLine[];
  firstDayLabel: string;
  lastDayLabel: string;
  lines: EmotionChartLine[];
}

/** Day timestamps are seconds at UTC midnight; the label is the local month.day. */
export function formatDayLabel(daySeconds: number): string {
  const date = new Date(daySeconds * 1000);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function gridLines(): EmotionChartGridLine[] {
  return [2, 1, 0, -1, -2].map((value) => ({
    value,
    y: BASELINE_Y - value * VALENCE_UNIT,
    label: value > 0 ? `+${value}` : String(value),
    isBaseline: value === 0,
  }));
}

export function buildEmotionChart(series: EmotionSeries): EmotionChart {
  const days = [...new Set([...series.expose, ...series.engage].map((point) => point.day))].sort(
    (left, right) => left - right,
  );
  const span = Math.max(1, days.length - 1);
  const xOf = (day: number) => PLOT_LEFT + (days.indexOf(day) / span) * PLOT_WIDTH;
  const yOf = (valence: number) => BASELINE_Y - valence * VALENCE_UNIT;

  const lines: EmotionChartLine[] = (["expose", "engage"] as const).map((key) => {
    const points = series[key].map((point) => ({
      x: xOf(point.day),
      y: yOf(point.valence),
      point,
    }));
    const last = points.at(-1);
    return {
      key,
      points,
      path: points
        .map(
          (entry, index) => `${index === 0 ? "M" : "L"}${entry.x.toFixed(1)},${entry.y.toFixed(1)}`,
        )
        .join(""),
      labelAnchor: last
        ? { x: Math.min(last.x + 6, EMOTION_CHART_WIDTH - 40), y: last.y + 3 }
        : null,
    };
  });

  return {
    width: EMOTION_CHART_WIDTH,
    height: EMOTION_CHART_HEIGHT,
    isEmpty: days.length === 0,
    gridLines: gridLines(),
    firstDayLabel: days.length ? formatDayLabel(days[0] as number) : "",
    lastDayLabel: days.length ? formatDayLabel(days.at(-1) as number) : "",
    lines,
  };
}

export interface NearestChartPoint {
  key: EmotionSeriesKey;
  point: EmotionPoint;
  x: number;
  y: number;
}

/** Nearest point to a cursor position already converted into chart coordinates. */
export function findNearestChartPoint(
  chart: EmotionChart,
  x: number,
  y: number,
  maxDistance = 30,
): NearestChartPoint | null {
  let best: (NearestChartPoint & { squaredDistance: number }) | null = null;
  for (const line of chart.lines) {
    for (const entry of line.points) {
      const dx = entry.x - x;
      const dy = entry.y - y;
      const squaredDistance = dx * dx + dy * dy;
      if (!best || squaredDistance < best.squaredDistance) {
        best = { key: line.key, point: entry.point, x: entry.x, y: entry.y, squaredDistance };
      }
    }
  }
  if (!best || best.squaredDistance > maxDistance * maxDistance) return null;
  const { squaredDistance: _ignored, ...nearest } = best;
  return nearest;
}
