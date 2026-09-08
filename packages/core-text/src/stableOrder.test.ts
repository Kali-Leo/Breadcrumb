import { describe, expect, it } from "vitest";
import { compareStable } from "./stableOrder";

describe("compareStable", () => {
  it("orders by code unit, which every runtime agrees on", () => {
    // 叶 is U+53F6 and 基 is U+57FA, so this order holds regardless of the machine's locale —
    // the very thing localeCompare does not promise.
    expect(compareStable("叶子", "基础")).toBe(-1);
    expect(compareStable("基础", "叶子")).toBe(1);
  });

  it("reports equality, so a sort can fall through to the next comparator", () => {
    expect(compareStable("同", "同")).toBe(0);
  });

  it("is antisymmetric for every pair it is given", () => {
    const words = ["", "a", "A", "ab", "基础", "叶子", "zebra", "１"];
    for (const left of words)
      // Summed rather than negated: -0 and 0 are different values to toBe, and an equal pair
      // legitimately produces one of each.
      for (const right of words)
        expect(compareStable(left, right) + compareStable(right, left)).toBe(0);
  });
});
