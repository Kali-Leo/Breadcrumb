/**
 * Purpose: unit tests for the three-layer trend series — window bounds, local-day sampling,
 * rounding, and that forgetting still shows up once sampled per day.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeLayerTrendSeries, TREND_WINDOW_DAYS } from "./trends";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

function sighting(nodeId: string, iso: string, id: string): NodeSightingRow {
  return { id, node_id: nodeId, conversation_id: "c1", message_id: null, created_at: iso };
}

function claim(nodeId: string, level: MasteryClaimRow["level"], iso: string): MasteryClaimRow {
  return {
    id: `cl-${nodeId}-${iso}`,
    node_id: nodeId,
    level,
    source: "self-report",
    created_at: iso,
  };
}

/** Non-empty-array accessors that fail loudly instead of leaning on a non-null assertion —
 * every call site here already knows the array is non-empty by construction. */
function firstOf<T>(items: readonly T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error("expected a non-empty array");
  return value;
}
function lastOf<T>(items: readonly T[]): T {
  const value = items[items.length - 1];
  if (value === undefined) throw new Error("expected a non-empty array");
  return value;
}

describe("TREND_WINDOW_DAYS", () => {
  it("is 90 — a season, matching the 30-day settled bar it displays alongside", () => {
    expect(TREND_WINDOW_DAYS).toBe(90);
  });
});

describe("computeLayerTrendSeries", () => {
  it("returns a full gap-free window, all zero, for no sightings", () => {
    const series = computeLayerTrendSeries({
      sightings: [],
      claims: [],
      productiveUseTimesByNode: new Map(),
      days: 5,
      todayIso: TODAY,
    });
    expect(series.map((point) => point.date)).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    for (const point of series) {
      expect(point).toEqual({
        date: point.date,
        memory: 0,
        understanding: 0,
        intuition: 0,
      });
    }
  });

  it("decays memory over time after a single sighting, rounded to one decimal", () => {
    const sightings = [sighting("a", localIso(2026, 1, 1), "s1")];
    // Window starts the same day as the sighting so the decay is visible inside the window
    // itself, rather than two already-faded points far past it.
    const series = computeLayerTrendSeries({
      sightings,
      claims: [],
      productiveUseTimesByNode: new Map(),
      days: 5,
      todayIso: localIso(2026, 1, 5),
    });
    const values = series.map((point) => point.memory);
    expect(values.every((value) => Number.isFinite(value))).toBe(true);
    expect(lastOf(values)).toBeLessThan(firstOf(values));
    for (const value of values) {
      expect(Math.round(value * 10)).toBe(value * 10);
    }
  });

  it("is near-1 for memory immediately after a fresh sighting", () => {
    const sightings = [sighting("a", TODAY, "s1")];
    const series = computeLayerTrendSeries({
      sightings,
      claims: [],
      productiveUseTimesByNode: new Map(),
      days: 1,
      todayIso: TODAY,
    });
    expect(firstOf(series).memory).toBeGreaterThan(0.9);
  });

  it("adds understanding once a claim exists, still bounded by memory", () => {
    const sightings = [sighting("a", localIso(2026, 1, 1), "s1")];
    const claims = [claim("a", "learned", localIso(2026, 1, 1))];
    const series = computeLayerTrendSeries({
      sightings,
      claims,
      productiveUseTimesByNode: new Map(),
      days: 1,
      todayIso: localIso(2026, 1, 1),
    });
    const point = firstOf(series);
    expect(point.understanding).toBeGreaterThan(0);
    expect(point.understanding).toBeLessThanOrEqual(point.memory);
  });
});
