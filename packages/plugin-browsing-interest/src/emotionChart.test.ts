/**
 * Purpose: the emotion chart has to survive series that disagree — different day sets, one
 * side empty, both empty, a single day, out-of-range valences. Tripwires: x never runs
 * backwards, points stay inside the drawing area, and the tooltip lookup only fires near a
 * real point.
 */
import { describe, expect, it } from "vitest";
import {
  buildEmotionChart,
  EMOTION_CHART_WIDTH,
  findNearestChartPoint,
  formatDayLabel,
} from "./emotionChart";
import type { EmotionPoint, EmotionSeries } from "./schemas";

const DAY = 86_400;
const START = 1_756_000_000 - (1_756_000_000 % DAY);

function point(dayIndex: number, valence: number, n = 5): EmotionPoint {
  return { day: START + dayIndex * DAY, valence, n, mix: Array(9).fill(0) };
}

function series(expose: EmotionPoint[], engage: EmotionPoint[]): EmotionSeries {
  return {
    emotions: Array(9).fill("情绪"),
    valences: [2, 1.5, 1, 0.5, 0, -0.5, -1, -1.5, -2],
    expose,
    engage,
  };
}

describe("emotion chart", () => {
  it("lays two disagreeing series on one shared timeline", () => {
    const chart = buildEmotionChart(
      series(
        [point(0, 0.7), point(1, 0.4), point(3, 0.2)],
        [point(1, 0.9), point(2, 0.8), point(3, 0.85)],
      ),
    );
    expect(chart.isEmpty).toBe(false);
    for (const line of chart.lines) {
      const xs = line.points.map((entry) => entry.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      for (const entry of line.points) {
        expect(entry.x).toBeGreaterThanOrEqual(0);
        expect(entry.x).toBeLessThanOrEqual(EMOTION_CHART_WIDTH);
      }
    }
    // Same day, same x, whichever series it came from.
    const exposeAtLastDay = chart.lines[0]?.points.at(-1)?.x;
    const engageAtLastDay = chart.lines[1]?.points.at(-1)?.x;
    expect(exposeAtLastDay).toBe(engageAtLastDay);
    expect(chart.firstDayLabel).toBe(formatDayLabel(START));
    expect(chart.lastDayLabel).toBe(formatDayLabel(START + 3 * DAY));
  });

  it("puts a happier day higher on the chart, and the zero line in the middle", () => {
    const chart = buildEmotionChart(series([point(0, 1.5), point(1, -1.5)], []));
    const [happy, sad] = chart.lines[0]?.points ?? [];
    expect(happy?.y).toBeLessThan(sad?.y as number);
    const baseline = chart.gridLines.find((line) => line.isBaseline);
    expect(baseline?.y).toBe(chart.height / 2);
  });

  it("stays drawable when there is nothing, or only one day, to draw", () => {
    const empty = buildEmotionChart(series([], []));
    expect(empty.isEmpty).toBe(true);
    expect(empty.lines.every((line) => line.path === "" && line.labelAnchor === null)).toBe(true);

    const single = buildEmotionChart(series([point(0, 0.5)], []));
    expect(single.isEmpty).toBe(false);
    expect(Number.isFinite(single.lines[0]?.points[0]?.x)).toBe(true);
    expect(single.firstDayLabel).toBe(single.lastDayLabel);
  });

  it("only reports a nearby point to the tooltip", () => {
    const chart = buildEmotionChart(series([point(0, 1), point(1, 0)], [point(0, -1)]));
    const target = chart.lines[0]?.points[0];
    const hit = findNearestChartPoint(chart, target?.x as number, target?.y as number);
    expect(hit?.key).toBe("expose");
    expect(hit?.point.valence).toBe(1);
    expect(findNearestChartPoint(chart, 5, 180, 10)).toBeNull();
  });
});
