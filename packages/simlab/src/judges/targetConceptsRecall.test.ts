/**
 * Purpose: unit tests for the targetConcepts recall metric and its documented matching rule.
 */
import { describe, expect, it } from "vitest";
import { computeTargetConceptsRecall } from "./targetConceptsRecall";

describe("computeTargetConceptsRecall", () => {
  it("is 1 for an empty targetConcepts set (vacuously complete)", () => {
    expect(computeTargetConceptsRecall([], [])).toBe(1);
  });

  it("counts an exact match after trim", () => {
    expect(computeTargetConceptsRecall(["闭包"], ["  闭包  "])).toBe(1);
  });

  it("counts a substring-containment fallback match either direction", () => {
    expect(computeTargetConceptsRecall(["判别式"], ["二次方程的判别式"])).toBe(1);
    expect(computeTargetConceptsRecall(["二次方程的判别式"], ["判别式"])).toBe(1);
  });

  it("computes a partial fraction when only some concepts were touched", () => {
    expect(computeTargetConceptsRecall(["闭包", "柯里化"], ["闭包"])).toBeCloseTo(0.5, 6);
  });

  it("is 0 when nothing touched matches", () => {
    expect(computeTargetConceptsRecall(["贝叶斯定理"], ["递归"])).toBe(0);
  });
});
