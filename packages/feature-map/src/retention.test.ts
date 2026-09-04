/**
 * Purpose: fog aggregation refuses numbers it cannot use. The mean feeds Pixi alphas directly,
 * and one NaN retrievability in the map used to poison a whole island's average — which draws
 * as a name that is simply not there (bug hunt 2026-09-03).
 */
import { describe, expect, it } from "vitest";
import { averageRetention } from "./retention";

describe("averageRetention", () => {
  it("averages the members it knows and counts the rest as remembered", () => {
    expect(averageRetention(["a", "b"], new Map([["a", 0.5]]))).toBeCloseTo(0.75);
    expect(averageRetention([], new Map())).toBe(1);
  });

  it("survives a NaN or an Infinity in the map", () => {
    const poisoned = new Map<string, number>([
      ["a", Number.NaN],
      ["b", Number.POSITIVE_INFINITY],
      ["c", 0.5],
    ]);
    const mean = averageRetention(["a", "b", "c"], poisoned);
    expect(Number.isFinite(mean)).toBe(true);
    expect(mean).toBeCloseTo((1 + 1 + 0.5) / 3);
  });

  it("keeps the mean inside [0, 1] whatever the rows say", () => {
    const wild = new Map<string, number>([
      ["a", -4],
      ["b", 9],
    ]);
    const mean = averageRetention(["a", "b"], wild);
    expect(mean).toBeGreaterThanOrEqual(0);
    expect(mean).toBeLessThanOrEqual(1);
  });
});
