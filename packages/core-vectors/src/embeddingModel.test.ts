/**
 * Purpose: the two facts nothing else can check for us — that the stored model name and width
 * are exactly what the Rust bridge and the browser Worker were written against, and that
 * truncation to the stored width leaves a unit vector rather than a short one.
 */
import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_QUERY_PREFIX,
  isCurrentEmbedding,
  truncateToStoredWidth,
} from "./embeddingModel";

describe("embedding model identity", () => {
  it("is the literal both editions were written against", () => {
    // Mirrored in apps/desktop/src-tauri/src/embeddings.rs and apps/web/src/shims/embeddings.ts.
    expect(EMBEDDING_MODEL).toBe("gte-multilingual-base-int8-384");
    expect(EMBEDDING_DIMENSIONS).toBe(384);
  });

  it("uses no task prefix, unlike the e5 model it replaces", () => {
    expect(EMBEDDING_QUERY_PREFIX).toBe("");
  });

  it("treats any other model's vectors as not comparable", () => {
    expect(isCurrentEmbedding(EMBEDDING_MODEL)).toBe(true);
    expect(isCurrentEmbedding("multilingual-e5-small")).toBe(false);
    // The one a dimension check cannot catch: same width, different model.
    expect(isCurrentEmbedding("multilingual-e5-small-q8")).toBe(false);
    expect(isCurrentEmbedding("")).toBe(false);
  });
});

describe("truncateToStoredWidth", () => {
  it("keeps the leading dimensions and returns unit length", () => {
    const vector = Array.from({ length: 768 }, (_unused, index) => (index % 7) - 3);
    const stored = truncateToStoredWidth(vector);
    expect(stored).toHaveLength(384);
    const norm = stored.reduce((sum, value) => sum + value * value, 0);
    expect(norm).toBeCloseTo(1, 10);
  });

  it("renormalizes rather than merely slicing", () => {
    // A unit vector whose energy is split evenly across 4 dimensions: slicing to 2 leaves a
    // vector of length 0.707, which every packed dot product would read as a weaker match.
    const half = 0.5;
    const stored = truncateToStoredWidth([half, half, half, half], 2);
    expect(stored[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(stored[1]).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("leaves a vector shorter than the target alone rather than padding it", () => {
    expect(truncateToStoredWidth([3, 4], 384)).toEqual([0.6, 0.8]);
  });
});
