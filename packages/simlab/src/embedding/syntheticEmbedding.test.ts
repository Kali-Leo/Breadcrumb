/**
 * Purpose: unit tests for the synthetic embedding's two required properties — determinism
 * and similarity-correlated cosine distance.
 */
import { describe, expect, it } from "vitest";
import {
  computeSyntheticEmbedding,
  computeSyntheticNodeEmbedding,
  SYNTHETIC_EMBEDDING_DIMENSIONS,
} from "./syntheticEmbedding";

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dotProduct += (a[index] ?? 0) * (b[index] ?? 0);
    normA += (a[index] ?? 0) ** 2;
    normB += (b[index] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe("computeSyntheticEmbedding", () => {
  it("has the fixed dimensionality", () => {
    expect(computeSyntheticEmbedding("闭包")).toHaveLength(SYNTHETIC_EMBEDDING_DIMENSIONS);
  });

  it("is deterministic: same input always yields the same vector", () => {
    const a = computeSyntheticEmbedding("导数：函数在一点的瞬时变化率");
    const b = computeSyntheticEmbedding("导数：函数在一点的瞬时变化率");
    expect(a).toEqual(b);
  });

  it("gives similar strings a higher cosine similarity than unrelated strings", () => {
    const derivative = computeSyntheticEmbedding("导数：函数在一点的瞬时变化率");
    const derivativeVariant = computeSyntheticEmbedding("导数：函数在某点的瞬时变化率");
    const unrelated = computeSyntheticEmbedding("递归：函数调用自身以分解问题");

    const similarPairSimilarity = cosineSimilarity(derivative, derivativeVariant);
    const unrelatedPairSimilarity = cosineSimilarity(derivative, unrelated);
    expect(similarPairSimilarity).toBeGreaterThan(unrelatedPairSimilarity);
  });

  it("produces a unit-length vector (or the zero vector for empty input)", () => {
    const vector = computeSyntheticEmbedding("极限");
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(computeSyntheticEmbedding("")).toEqual(
      new Array(SYNTHETIC_EMBEDDING_DIMENSIONS).fill(0),
    );
  });
});

describe("computeSyntheticNodeEmbedding", () => {
  it("matches computeSyntheticEmbedding over the app's `label: summary` convention", () => {
    expect(computeSyntheticNodeEmbedding("闭包", "函数记住定义时的作用域")).toEqual(
      computeSyntheticEmbedding("闭包: 函数记住定义时的作用域"),
    );
  });
});
