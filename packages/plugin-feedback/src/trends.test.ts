/**
 * Purpose: unit tests for the concept/knowledge/word-seen trend series — window bounds,
 * local-day cutting, pre-window base, never-decreasing cumulative series, and knowledge-sum
 * decay.
 */
import type { DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  computeCumulativeConceptSeries,
  computeKnowledgeSumSeries,
  computeWordSeenSeries,
  TREND_WINDOW_DAYS,
} from "./trends";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

function sighting(nodeId: string, iso: string, id: string): NodeSightingRow {
  return { id, node_id: nodeId, conversation_id: "c1", message_id: null, created_at: iso };
}

function wordState(lemma: string, introducedAtIso: string): DiglotWordStateRow {
  return {
    lemma,
    pair: "zh:en",
    fsrs_json: JSON.stringify({
      stability: 0,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      due: introducedAtIso,
      last_review: undefined,
    }),
    due: introducedAtIso,
    introduced_at: introducedAtIso,
    last_event_at: null,
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

describe("computeCumulativeConceptSeries", () => {
  it("returns a full gap-free window, all zero, for no sightings", () => {
    const series = computeCumulativeConceptSeries([], { days: 5, todayIso: TODAY });
    expect(series.map((point) => point.date)).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    expect(series.every((point) => point.value === 0)).toBe(true);
  });

  it("carries a pre-window base instead of starting from zero", () => {
    const sightings = [sighting("old", localIso(2026, 1, 1), "s1")];
    const series = computeCumulativeConceptSeries(sightings, { days: 5, todayIso: TODAY });
    expect(series.every((point) => point.value === 1)).toBe(true);
  });

  it("cuts days by local calendar time, not UTC", () => {
    // 2026-08-11 23:30 local time — must land on the 11th, not spill into the 12th.
    const sightings = [sighting("a", localIso(2026, 8, 11, 23), "s1")];
    const series = computeCumulativeConceptSeries(sightings, { days: 5, todayIso: TODAY });
    const byDate = new Map(series.map((point) => [point.date, point.value]));
    expect(byDate.get("2026-08-10")).toBe(0);
    expect(byDate.get("2026-08-11")).toBe(1);
  });

  it("never decreases and counts distinct nodes, not sighting events", () => {
    const sightings = [
      sighting("a", localIso(2026, 8, 9), "s1"),
      sighting("a", localIso(2026, 8, 9), "s2"),
      sighting("b", localIso(2026, 8, 11), "s3"),
    ];
    const series = computeCumulativeConceptSeries(sightings, { days: 5, todayIso: TODAY });
    const values = series.map((point) => point.value);
    // Exact values already pin down the never-decreasing shape (1, 1, 2, 2, 2).
    expect(values).toEqual([1, 1, 2, 2, 2]);
  });
});

describe("computeKnowledgeSumSeries", () => {
  it("is all zero for no sightings", () => {
    const series = computeKnowledgeSumSeries([], { days: 5, todayIso: TODAY });
    expect(series.every((point) => point.value === 0)).toBe(true);
  });

  it("decays over time after a single sighting, rounded to one decimal", () => {
    const sightings = [sighting("a", localIso(2026, 1, 1), "s1")];
    // Window starts the same day as the sighting so the decay is visible inside the window
    // itself, rather than two already-faded points far past it.
    const series = computeKnowledgeSumSeries(sightings, {
      days: 5,
      todayIso: localIso(2026, 1, 5),
    });
    const values = series.map((point) => point.value);
    expect(values.every((value) => Number.isFinite(value))).toBe(true);
    expect(lastOf(values)).toBeLessThan(firstOf(values));
    for (const value of values) {
      expect(Math.round(value * 10)).toBe(value * 10);
    }
  });

  it("is near-1 immediately after a fresh sighting", () => {
    const sightings = [sighting("a", TODAY, "s1")];
    const series = computeKnowledgeSumSeries(sightings, { days: 1, todayIso: TODAY });
    expect(firstOf(series).value).toBeGreaterThan(0.9);
  });
});

describe("computeWordSeenSeries", () => {
  it("returns an empty-valued, gap-free window for no word states", () => {
    const series = computeWordSeenSeries([], { days: 3, todayIso: TODAY });
    expect(series.every((point) => point.value === 0)).toBe(true);
    expect(series).toHaveLength(3);
  });

  it("is a strictly never-decreasing cumulative count by introduction day", () => {
    const states = [
      wordState("a", localIso(2026, 8, 9)),
      wordState("b", localIso(2026, 8, 9)),
      wordState("c", localIso(2026, 8, 12)),
    ];
    const series = computeWordSeenSeries(states, { days: 5, todayIso: TODAY });
    const values = series.map((point) => point.value);
    expect(values).toEqual([2, 2, 2, 3, 3]);
  });
});
