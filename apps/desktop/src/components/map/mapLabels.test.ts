/**
 * Purpose: the one number a map name hands to Pixi. `alpha` is taken on trust by the renderer:
 * a NaN there draws nothing at all, so an island whose retention average went bad would simply
 * lose its name with no error anywhere (bug hunt 2026-09-03). labelDim is the last place that
 * can refuse a number it cannot use.
 */
import { describe, expect, it } from "vitest";
import { labelDim } from "./mapLabels";

const FLOOR = 0.72;

describe("labelDim", () => {
  it("maps a real retention onto the readable band", () => {
    expect(labelDim(1)).toBeCloseTo(1);
    expect(labelDim(0)).toBeCloseTo(FLOOR);
    expect(labelDim(0.5)).toBeCloseTo((1 + FLOOR) / 2);
  });

  it("never returns a value Pixi cannot use", () => {
    for (const retention of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -3,
      7,
      0,
      1,
      0.31,
    ]) {
      const alpha = labelDim(retention);
      expect(Number.isFinite(alpha), `labelDim(${retention}) = ${alpha}`).toBe(true);
      expect(alpha).toBeGreaterThanOrEqual(FLOOR);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it("treats an unreadable retention as fully remembered, never as fog", () => {
    // Fog is a claim about the learner; a broken number is not grounds to make it.
    expect(labelDim(Number.NaN)).toBe(labelDim(1));
  });
});
