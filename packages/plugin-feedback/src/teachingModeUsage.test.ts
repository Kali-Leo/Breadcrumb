/**
 * Purpose: unit tests for the teaching-mode usage tally — empty input, a single mode,
 * a mix of all three, and unknown mode values being ignored entirely.
 */
import { describe, expect, it } from "vitest";
import { computeTeachingModeUsage } from "./teachingModeUsage";

describe("computeTeachingModeUsage", () => {
  it("is all zero for no rows", () => {
    expect(computeTeachingModeUsage([])).toEqual({
      adaptive: 0,
      direct: 0,
      guided: 0,
      total: 0,
    });
  });

  it("tallies a single mode", () => {
    const result = computeTeachingModeUsage([{ teaching_mode: "direct", count: 5 }]);
    expect(result).toEqual({ adaptive: 0, direct: 5, guided: 0, total: 5 });
  });

  it("tallies a mix of all three modes", () => {
    const result = computeTeachingModeUsage([
      { teaching_mode: "adaptive", count: 3 },
      { teaching_mode: "direct", count: 2 },
      { teaching_mode: "guided", count: 7 },
    ]);
    expect(result).toEqual({ adaptive: 3, direct: 2, guided: 7, total: 12 });
  });

  it("ignores unknown mode values, excluding them from total", () => {
    const result = computeTeachingModeUsage([
      { teaching_mode: "adaptive", count: 3 },
      { teaching_mode: "legacy-mode", count: 100 },
    ]);
    expect(result).toEqual({ adaptive: 3, direct: 0, guided: 0, total: 3 });
  });
});
