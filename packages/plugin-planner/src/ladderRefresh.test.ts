/**
 * Purpose: unit tests for the ranked ladder's refresh cadence (spec 020) — due/not-due
 * decisions, the seeded randomized expiry window, and six-row board assembly ordering.
 */
import { describe, expect, it } from "vitest";
import {
  assembleLadderSlots,
  isRefreshDue,
  LADDER_REFRESH_MAX_HOURS,
  LADDER_REFRESH_MIN_HOURS,
  nextRefreshAtIso,
} from "./ladderRefresh";

const NOW = "2026-08-05T12:00:00.000Z";

describe("isRefreshDue", () => {
  it("is due with no schedule at all (fresh goal)", () => {
    expect(isRefreshDue(null, NOW)).toBe(true);
  });

  it("is due once the scheduled moment has passed (or is exactly now)", () => {
    expect(isRefreshDue("2026-08-05T11:59:59.000Z", NOW)).toBe(true);
    expect(isRefreshDue(NOW, NOW)).toBe(true);
  });

  it("is not due before the scheduled moment", () => {
    expect(isRefreshDue("2026-08-05T12:00:01.000Z", NOW)).toBe(false);
  });
});

describe("nextRefreshAtIso", () => {
  it("schedules inside the randomized window", () => {
    for (const seed of ["g1:1", "g1:2", "g2:1", "g3:7"]) {
      const at = Date.parse(nextRefreshAtIso(NOW, seed));
      const hoursAhead = (at - Date.parse(NOW)) / 3_600_000;
      expect(hoursAhead).toBeGreaterThanOrEqual(LADDER_REFRESH_MIN_HOURS);
      expect(hoursAhead).toBeLessThanOrEqual(LADDER_REFRESH_MAX_HOURS);
    }
  });

  it("is deterministic per seed and varies across generations (有长有短)", () => {
    expect(nextRefreshAtIso(NOW, "g1:1")).toBe(nextRefreshAtIso(NOW, "g1:1"));
    const stretches = new Set(
      ["g1:1", "g1:2", "g1:3", "g1:4", "g1:5"].map((seed) => nextRefreshAtIso(NOW, seed)),
    );
    expect(stretches.size).toBeGreaterThan(1);
  });
});

describe("assembleLadderSlots", () => {
  it("sorts 3 above + user + 2 below ascending by rank, user on the 4th row", () => {
    const slots = assembleLadderSlots([996, 998, 999], 1000, [1002, 1005]);
    expect(slots.map((slot) => slot.rank)).toEqual([996, 998, 999, 1000, 1002, 1005]);
    expect(slots.findIndex((slot) => slot.isUser)).toBe(3);
  });

  it("keeps the user at index 3 regardless of how compressed the ranks are", () => {
    const slots = assembleLadderSlots([1, 2, 3], 4, [5, 6]);
    expect(slots.findIndex((slot) => slot.isUser)).toBe(3);
    expect(slots).toHaveLength(6);
  });
});
