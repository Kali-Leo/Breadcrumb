/**
 * Purpose: unit tests for the heatmap day-bucketing and continuity streak math — full
 * date-range completeness, local-day cutting, and the "counts yesterday if today is still
 * empty" continuity rule.
 */
import { toLocalDateKey as coreDateKey } from "@breadcrumb/core-time";
import { describe, expect, it } from "vitest";
import { computeContinuity, computeDailyActivity, toLocalDateKey } from "./activity";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

describe("computeDailyActivity", () => {
  it("returns a full gap-free range even with no events", () => {
    const cells = computeDailyActivity([], { days: 5, todayIso: TODAY });
    expect(cells.map((cell) => cell.date)).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    expect(cells.every((cell) => cell.count === 0)).toBe(true);
  });

  it("buckets multiple same-day events into one cell's count", () => {
    const cells = computeDailyActivity(
      [localIso(2026, 8, 11, 1), localIso(2026, 8, 11, 23), localIso(2026, 8, 13, 9)],
      { days: 5, todayIso: TODAY },
    );
    const byDate = new Map(cells.map((cell) => [cell.date, cell.count]));
    expect(byDate.get("2026-08-11")).toBe(2);
    expect(byDate.get("2026-08-13")).toBe(1);
    expect(byDate.get("2026-08-09")).toBe(0);
  });

  it("ignores events outside the requested window", () => {
    const cells = computeDailyActivity([localIso(2026, 8, 1)], { days: 3, todayIso: TODAY });
    expect(cells.every((cell) => cell.count === 0)).toBe(true);
  });
});

describe("computeContinuity", () => {
  it("is all zero for an empty range", () => {
    expect(computeContinuity([])).toEqual({
      activeDays: 0,
      longestRunDays: 0,
      currentRunDays: 0,
    });
  });

  it("counts active days and the longest run across a gap", () => {
    const cells = computeDailyActivity(
      [localIso(2026, 8, 7), localIso(2026, 8, 8), localIso(2026, 8, 9), localIso(2026, 8, 12)],
      { days: 7, todayIso: TODAY },
    );
    const continuity = computeContinuity(cells);
    expect(continuity.activeDays).toBe(4);
    expect(continuity.longestRunDays).toBe(3);
  });

  it("current run ends today when today is active", () => {
    const cells = computeDailyActivity([localIso(2026, 8, 12), localIso(2026, 8, 13)], {
      days: 7,
      todayIso: TODAY,
    });
    expect(computeContinuity(cells).currentRunDays).toBe(2);
  });

  it("current run ends yesterday when today has no activity yet", () => {
    const cells = computeDailyActivity([localIso(2026, 8, 11), localIso(2026, 8, 12)], {
      days: 7,
      todayIso: TODAY,
    });
    expect(computeContinuity(cells).currentRunDays).toBe(2);
  });

  it("current run is zero when neither today nor yesterday is active", () => {
    const cells = computeDailyActivity([localIso(2026, 8, 10)], { days: 7, todayIso: TODAY });
    expect(computeContinuity(cells).currentRunDays).toBe(0);
  });

  it("current run is zero for a single-day range with no activity", () => {
    const cells = computeDailyActivity([], { days: 1, todayIso: TODAY });
    expect(computeContinuity(cells).currentRunDays).toBe(0);
  });
});

/** The heatmap, the research lab's daily buckets and the trail's summary all have to cut the
 * calendar at the same instant, or one study session lands on two different days depending on
 * which surface is looking at it. Before 2026-09-02 that agreement rested on three
 * byte-identical private copies and a comment; this fails the moment one is reintroduced. */
describe("day cutting agrees with @breadcrumb/core-time", () => {
  it("gives the same key as core-time for every hour of a day", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const iso = new Date(2026, 6, 29, hour, 30).toISOString();
      expect(toLocalDateKey(iso)).toBe(coreDateKey(iso));
    }
  });
});
