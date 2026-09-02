/**
 * Purpose: tests for the layout day helpers — local midnight resolution and the
 * pre-day row filter that gives the palace its daily rhythm.
 */
import { describe, expect, it } from "vitest";
import { rowsBeforeDay, startOfLocalDayIso } from "./layoutDay";

describe("startOfLocalDayIso", () => {
  it("returns local midnight of the given moment as an ISO instant", () => {
    const noon = new Date(2026, 7, 31, 12, 34, 56);
    const parsed = new Date(startOfLocalDayIso(noon));
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(31);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });

  it("is stable across the whole day — every moment maps to the same day start", () => {
    const morning = new Date(2026, 7, 31, 0, 0, 1);
    const night = new Date(2026, 7, 31, 23, 59, 59);
    expect(startOfLocalDayIso(morning)).toBe(startOfLocalDayIso(night));
  });
});

describe("rowsBeforeDay", () => {
  it("keeps rows created before the day start and drops today's", () => {
    const dayStart = "2026-08-31T00:00:00.000Z";
    const rows = [
      { id: "old", created_at: "2026-08-30T23:59:59Z" },
      { id: "today", created_at: "2026-08-31T08:00:00Z" },
    ];
    expect(rowsBeforeDay(rows, dayStart).map((row) => row.id)).toEqual(["old"]);
  });
});
