/**
 * Purpose: pins the one day-cutting rule the whole product shares. The keys asserted here are
 * the exact strings feature-feedback/activity.ts, feature-research/statisticsSeries.ts and
 * feature-trail/index.ts each produced from their own copy before 2026-09-02 — this file is
 * what makes "the same instant is the same day everywhere" a checked fact instead of a
 * comment pointing at another module.
 */
import { describe, expect, it } from "vitest";
import {
  dateKeyRange,
  dateKeyToLocalDate,
  shiftDateKey,
  shiftLocalDays,
  startOfLocalDay,
  startOfLocalDayIso,
  toLocalDateKey,
} from "./dateKeys";

describe("toLocalDateKey", () => {
  it("zero-pads month and day", () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 13, 0))).toBe("2026-01-05");
    expect(toLocalDateKey(new Date(2026, 10, 30, 23, 59))).toBe("2026-11-30");
  });

  it("reads an ISO instant in local time, and agrees with the Date form", () => {
    const instant = new Date(2026, 6, 29, 15, 30);
    expect(toLocalDateKey(instant.toISOString())).toBe(toLocalDateKey(instant));
    expect(toLocalDateKey(instant)).toBe("2026-07-29");
  });

  it("cuts the day at local midnight, not UTC midnight", () => {
    const justBefore = new Date(2026, 6, 29, 23, 59, 59);
    const justAfter = new Date(2026, 6, 30, 0, 0, 0);
    expect(toLocalDateKey(justBefore)).toBe("2026-07-29");
    expect(toLocalDateKey(justAfter)).toBe("2026-07-30");
  });
});

describe("shiftDateKey", () => {
  it("crosses month and year boundaries", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2026-07-29", 0)).toBe("2026-07-29");
  });
});

describe("dateKeyRange", () => {
  it("ends on the given day and runs oldest first, gap-free", () => {
    expect(dateKeyRange(3, new Date(2026, 6, 29, 15, 30))).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });

  it("is empty for a non-positive window", () => {
    expect(dateKeyRange(0, new Date(2026, 6, 29))).toEqual([]);
  });
});

describe("startOfLocalDay", () => {
  it("keeps the calendar day and clears the clock", () => {
    const start = startOfLocalDay(new Date(2026, 6, 29, 15, 30, 12, 345));
    expect(toLocalDateKey(start)).toBe("2026-07-29");
    expect([
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });

  it("collapses every moment of one local day onto the same ISO instant", () => {
    const morning = new Date(2026, 6, 29, 0, 30);
    const night = new Date(2026, 6, 29, 23, 30);
    expect(startOfLocalDayIso(morning)).toBe(startOfLocalDayIso(night));
  });
});

describe("dateKeyToLocalDate / shiftLocalDays", () => {
  it("round-trips a key through local midnight", () => {
    expect(toLocalDateKey(dateKeyToLocalDate("2026-02-28"))).toBe("2026-02-28");
  });

  it("moves whole calendar days, leaving the original untouched", () => {
    const base = new Date(2026, 6, 29, 15, 30);
    expect(toLocalDateKey(shiftLocalDays(base, 3))).toBe("2026-08-01");
    expect(toLocalDateKey(base)).toBe("2026-07-29");
  });
});
