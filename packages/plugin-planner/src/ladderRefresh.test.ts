/**
 * Purpose: unit tests for the assessment cache's refresh cadence (spec 022) — due/not-due
 * decisions and the seeded randomized expiry window.
 */
import { describe, expect, it } from "vitest";
import {
  isRefreshDue,
  LADDER_REFRESH_MAX_HOURS,
  LADDER_REFRESH_MIN_HOURS,
  nextRefreshAtIso,
} from "./ladderRefresh";

const NOW = "2026-08-09T12:00:00.000Z";

describe("isRefreshDue", () => {
  it("is due with no schedule at all (fresh goal)", () => {
    expect(isRefreshDue(null, NOW)).toBe(true);
  });

  it("is due once the scheduled moment has passed (or is exactly now)", () => {
    expect(isRefreshDue("2026-08-09T11:59:59.000Z", NOW)).toBe(true);
    expect(isRefreshDue(NOW, NOW)).toBe(true);
  });

  it("is not due before the scheduled moment", () => {
    expect(isRefreshDue("2026-08-09T12:00:01.000Z", NOW)).toBe(false);
  });
});

describe("nextRefreshAtIso", () => {
  it("schedules inside the randomized window", () => {
    for (const seed of ["g1:a", "g1:b", "g2:a", "g3:z"]) {
      const at = Date.parse(nextRefreshAtIso(NOW, seed));
      const hoursAhead = (at - Date.parse(NOW)) / 3_600_000;
      expect(hoursAhead).toBeGreaterThanOrEqual(LADDER_REFRESH_MIN_HOURS);
      expect(hoursAhead).toBeLessThanOrEqual(LADDER_REFRESH_MAX_HOURS);
    }
  });

  it("is deterministic per seed and varies across seeds (有长有短)", () => {
    expect(nextRefreshAtIso(NOW, "g1:a")).toBe(nextRefreshAtIso(NOW, "g1:a"));
    const stretches = new Set(
      ["g1:a", "g1:b", "g1:c", "g1:d", "g1:e"].map((seed) => nextRefreshAtIso(NOW, seed)),
    );
    expect(stretches.size).toBeGreaterThan(1);
  });
});
