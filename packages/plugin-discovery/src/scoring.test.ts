/**
 * Purpose: unit tests for computeCentroid's weighted-mean/zero-safety and scoreByCentroids'
 * cosine combination, including the null-centroid-contributes-0 rule.
 */
import { describe, expect, it } from "vitest";
import { computeCentroid, scoreByCentroids } from "./scoring";

describe("computeCentroid", () => {
  it("returns the weighted mean of the given vectors", () => {
    const centroid = computeCentroid(
      [
        [1, 0],
        [0, 1],
      ],
      [1, 1],
    );
    expect(centroid[0]).toBeCloseTo(0.5, 5);
    expect(centroid[1]).toBeCloseTo(0.5, 5);
  });

  it("weights vectors unevenly according to the given weights", () => {
    const centroid = computeCentroid(
      [
        [1, 0],
        [0, 1],
      ],
      [3, 1],
    );
    expect(centroid[0]).toBeCloseTo(0.75, 5);
    expect(centroid[1]).toBeCloseTo(0.25, 5);
  });

  it("returns an empty vector for an empty input", () => {
    expect(computeCentroid([], [])).toEqual([]);
  });

  it("returns the zero vector instead of dividing by zero when total weight is zero", () => {
    expect(
      computeCentroid(
        [
          [1, 2],
          [3, 4],
        ],
        [0, 0],
      ),
    ).toEqual([0, 0]);
  });
});

describe("scoreByCentroids", () => {
  it("scores identical positive centroid as cosine similarity 1", () => {
    expect(scoreByCentroids([1, 0], [1, 0], null)).toBeCloseTo(1, 5);
  });

  it("subtracts 0.6x negative-centroid similarity", () => {
    const score = scoreByCentroids([1, 0], [1, 0], [1, 0]);
    expect(score).toBeCloseTo(1 - 0.6 * 1, 5);
  });

  it("treats a null positive centroid as contributing 0", () => {
    expect(scoreByCentroids([1, 0], null, [1, 0])).toBeCloseTo(0 - 0.6 * 1, 5);
  });

  it("treats both centroids null as a score of exactly 0", () => {
    expect(scoreByCentroids([1, 0], null, null)).toBe(0);
  });

  it("scores orthogonal vectors as 0 similarity", () => {
    expect(scoreByCentroids([1, 0], [0, 1], null)).toBeCloseTo(0, 5);
  });
});
