/**
 * Purpose: unit tests for the targetConcepts echo metric and its documented matching rule —
 * including the looseness that is exactly why the 2026-08-28 audit demoted it from a reported
 * recall figure to a metrics.json-only signal.
 */
import { describe, expect, it } from "vitest";
import { computeTargetConceptsEcho } from "./targetConceptsEcho";

describe("computeTargetConceptsEcho", () => {
  it("is 1 for an empty targetConcepts set (vacuously complete)", () => {
    expect(computeTargetConceptsEcho([], [])).toBe(1);
  });

  it("counts an exact match after trim", () => {
    expect(computeTargetConceptsEcho(["闭包"], ["  闭包  "])).toBe(1);
  });

  it("counts a substring-containment fallback match either direction", () => {
    expect(computeTargetConceptsEcho(["判别式"], ["二次方程的判别式"])).toBe(1);
    expect(computeTargetConceptsEcho(["二次方程的判别式"], ["判别式"])).toBe(1);
  });

  it("computes a partial fraction when only some concepts were touched", () => {
    expect(computeTargetConceptsEcho(["闭包", "柯里化"], ["闭包"])).toBeCloseTo(0.5, 6);
  });

  it("is 0 when nothing touched matches", () => {
    expect(computeTargetConceptsEcho(["贝叶斯定理"], ["递归"])).toBe(0);
  });

  it("scores a full 1.0 off one generic label — the reason it is not reported as recall", () => {
    // A single-character label containment-matches every target that contains it, so a
    // pipeline that extracted nothing but "树" would still look complete.
    expect(computeTargetConceptsEcho(["二叉树", "红黑树"], ["树"])).toBe(1);
  });
});
