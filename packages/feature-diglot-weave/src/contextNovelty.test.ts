/**
 * Purpose: tests for the contextual-diversity math — similarity bounds, novelty banding
 * and degrade behavior (spec 033).
 */
import { describe, expect, it } from "vitest";
import { cosineSimilarity, hashContext, noveltyFactor } from "./contextNovelty";

describe("cosineSimilarity", () => {
  it("is 1 for identical and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 for mismatched or empty input", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});

describe("noveltyFactor", () => {
  it("discounts repeats and boosts novel contexts", () => {
    const vector = [0.2, 0.8, 0.1];
    expect(noveltyFactor(vector, [vector])).toBeCloseTo(0.5);
    expect(noveltyFactor([1, 0, 0], [[0, 1, 0]])).toBeCloseTo(1.5);
  });

  it("gives the first context a mild bonus and degrades to neutral without a vector", () => {
    expect(noveltyFactor([1, 2], [])).toBeCloseTo(1.2);
    expect(noveltyFactor(null, [[1, 2]])).toBe(1);
  });
});

describe("hashContext", () => {
  it("is stable and distinguishes different sentences", () => {
    expect(hashContext("你好朋友")).toBe(hashContext("你好朋友"));
    expect(hashContext("你好朋友")).not.toBe(hashContext("你好世界"));
  });
});
