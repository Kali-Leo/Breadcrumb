/**
 * Purpose: unit tests for the daily-bite counters — today's reunions vs today's brand-new
 * concepts, both capped at their target, completion flag, and the empty-day baseline.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeDailyBite } from "./dailyBite";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

function sighting(nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

describe("computeDailyBite", () => {
  it("is all zero and incomplete for no sightings", () => {
    const result = computeDailyBite({
      sightings: [],
      todayIso: TODAY,
      reunionTarget: 3,
      newTarget: 1,
    });
    expect(result).toEqual({
      reunionsDone: 0,
      newDone: 0,
      reunionTarget: 3,
      newTarget: 1,
      complete: false,
    });
  });

  it("counts a node met before today and again today as a reunion, not new", () => {
    const sightings = [sighting("a", localIso(2026, 8, 1)), sighting("a", localIso(2026, 8, 13))];
    const result = computeDailyBite({ sightings, todayIso: TODAY, reunionTarget: 3, newTarget: 1 });
    expect(result.reunionsDone).toBe(1);
    expect(result.newDone).toBe(0);
  });

  it("counts a node met for the first time today as new", () => {
    const sightings = [sighting("a", localIso(2026, 8, 13))];
    const result = computeDailyBite({ sightings, todayIso: TODAY, reunionTarget: 3, newTarget: 1 });
    expect(result.newDone).toBe(1);
    expect(result.reunionsDone).toBe(0);
  });

  it("caps both counters at their targets", () => {
    const sightings = [
      sighting("old-a", localIso(2026, 8, 1)),
      sighting("old-a", localIso(2026, 8, 13)),
      sighting("old-b", localIso(2026, 8, 2)),
      sighting("old-b", localIso(2026, 8, 13)),
      sighting("old-c", localIso(2026, 8, 3)),
      sighting("old-c", localIso(2026, 8, 13)),
      sighting("old-d", localIso(2026, 8, 4)),
      sighting("old-d", localIso(2026, 8, 13)),
      sighting("new-a", localIso(2026, 8, 13)),
      sighting("new-b", localIso(2026, 8, 13)),
    ];
    const result = computeDailyBite({ sightings, todayIso: TODAY, reunionTarget: 3, newTarget: 1 });
    expect(result.reunionsDone).toBe(3);
    expect(result.newDone).toBe(1);
    expect(result.complete).toBe(true);
  });

  it("is incomplete when either counter is under target", () => {
    const sightings = [
      sighting("old-a", localIso(2026, 8, 1)),
      sighting("old-a", localIso(2026, 8, 13)),
    ];
    const result = computeDailyBite({ sightings, todayIso: TODAY, reunionTarget: 3, newTarget: 1 });
    expect(result.complete).toBe(false);
  });

  it("ignores sightings from other days entirely", () => {
    const sightings = [sighting("a", localIso(2026, 8, 12))];
    const result = computeDailyBite({ sightings, todayIso: TODAY, reunionTarget: 3, newTarget: 1 });
    expect(result.reunionsDone).toBe(0);
    expect(result.newDone).toBe(0);
  });
});
