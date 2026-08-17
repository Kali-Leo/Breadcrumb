/**
 * Purpose: tests for the crowd-signal curve — that it stays inside the contract's 0..1 range, that
 * it keeps ordinary counts apart instead of flattening everything below the top item, that it
 * rises with the count, and that junk arriving from the network reads as no signal rather than
 * breaking the item.
 */
import { describe, expect, it } from "vitest";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

const points = saturationCounts.hackerNewsPoints;

describe("normalizeCountToSignal", () => {
  it("runs from nothing to one over the channel's range", () => {
    expect(normalizeCountToSignal(0, points)).toBe(0);
    expect(normalizeCountToSignal(points, points)).toBeCloseTo(1, 10);
    expect(normalizeCountToSignal(points * 10, points)).toBe(1);
  });

  it("rises with the count", () => {
    const rising = [1, 10, 50, 200, 500].map((count) => normalizeCountToSignal(count, points));
    for (let index = 1; index < rising.length; index += 1) {
      expect(rising[index]).toBeGreaterThan(rising[index - 1] as number);
    }
  });

  it("keeps ordinary items apart rather than crushing them toward zero", () => {
    // A linear scale would put a 20-point story at 0.04 and a 60-point story at 0.12; the log
    // curve keeps both in the middle of the range where ranking can still tell them apart.
    expect(normalizeCountToSignal(20, points)).toBeGreaterThan(0.4);
    expect(normalizeCountToSignal(60, points)).toBeGreaterThan(0.6);
  });

  it("treats a missing or nonsensical count as no signal", () => {
    expect(normalizeCountToSignal(Number.NaN, points)).toBe(0);
    expect(normalizeCountToSignal(-5, points)).toBe(0);
    expect(normalizeCountToSignal(Number.POSITIVE_INFINITY, points)).toBe(0);
  });

  it("does not divide by a saturation point that makes no sense", () => {
    expect(normalizeCountToSignal(5, 0)).toBe(1);
    expect(normalizeCountToSignal(5, Number.NaN)).toBe(1);
  });
});
