/**
 * Purpose: pins the merged cosine/gate math, and in particular the one place the six former
 * copies disagreed — a length mismatch. Five truncated to the shorter vector and returned a
 * cosine over the surviving dimensions; this asserts the strict answer (0) that the sixth
 * already gave, because a 64-dimension vector and a 384-dimension one were never comparable.
 */
import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  l2Normalize,
  RELATIVE_GATE_FRACTION,
  relativeGate,
  similarityBaseline,
} from "./similarity";

describe("cosineSimilarity", () => {
  it("is 1 for identical directions and 0 for orthogonal ones", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("refuses vectors of different lengths instead of truncating them", () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("is 0 when either side has no direction", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("l2Normalize", () => {
  it("scales to unit length", () => {
    expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
    const norm = l2Normalize([1, 2, 3]).reduce((sum, value) => sum + value * value, 0);
    expect(norm).toBeCloseTo(1);
  });

  it("copies a zero vector rather than dividing by zero", () => {
    const zero = [0, 0, 0];
    const normalized = l2Normalize(zero);
    expect(normalized).toEqual([0, 0, 0]);
    expect(normalized).not.toBe(zero);
  });
});

describe("similarityBaseline / relativeGate", () => {
  it("gates at mean plus half the gap to best", () => {
    const baseline = similarityBaseline([0.8, 0.9]);
    expect(baseline).toEqual({ mean: 0.8500000000000001, best: 0.9 });
    expect(relativeGate(baseline)).toBeCloseTo(0.875);
    expect(RELATIVE_GATE_FRACTION).toBe(0.5);
  });

  it("lets a lone candidate clear its own gate", () => {
    const baseline = similarityBaseline([0.42]);
    expect(baseline).toEqual({ mean: 0.42, best: 0.42 });
    expect(relativeGate(baseline)).toBe(0.42);
  });

  it("has no landscape for an empty list", () => {
    expect(similarityBaseline([])).toEqual({ mean: 0, best: 0 });
    expect(relativeGate(similarityBaseline([]))).toBe(0);
  });

  it("clamps a float-rounded mean to best, so the gate never rejects everything", () => {
    const nearlyIdentical = [0.1, 0.2, 0.30000000000000004];
    const baseline = similarityBaseline(nearlyIdentical);
    expect(baseline.mean).toBeLessThanOrEqual(baseline.best);
    for (const similarity of nearlyIdentical) {
      expect(relativeGate({ mean: similarity, best: similarity })).toBe(similarity);
    }
  });
});
