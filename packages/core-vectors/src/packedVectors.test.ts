/**
 * Purpose: the packed pass has to agree with the plain textbook cosine it replaces — that is
 * the whole claim being made about it — and has to survive the inputs that show up in a real
 * database: a zero vector, a single node, no nodes at all.
 */
import { describe, expect, it } from "vitest";
import { packVectors, partnersOf, similarityBetween, similarityLandscape } from "./packedVectors";

/** The implementation this replaces, kept here as the reference to compare against. */
function plainCosine(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function randomEntries(count: number, dims: number) {
  let seed = 42;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };
  return Array.from({ length: count }, (_unused, index) => ({
    id: `n${index}`,
    vector: Array.from({ length: dims }, next),
  }));
}

describe("packed similarity", () => {
  it("agrees with the plain cosine it replaces", () => {
    const entries = randomEntries(24, 48);
    const packed = packVectors(entries);
    for (let a = 0; a < entries.length; a += 1) {
      for (let b = 0; b < entries.length; b += 1) {
        if (a === b) continue;
        const expected = plainCosine(entries[a]?.vector ?? [], entries[b]?.vector ?? []);
        // Float32 storage: agreement to six decimals, not to the bit.
        expect(similarityBetween(packed, a, b)).toBeCloseTo(expected, 6);
      }
    }
  });

  it("computes the same mean and best a per-node loop would", () => {
    const entries = randomEntries(15, 32);
    const packed = packVectors(entries);
    const landscape = similarityLandscape(packed);
    entries.forEach((entry, index) => {
      const others = entries.filter((_other, otherIndex) => otherIndex !== index);
      const similarities = others.map((other) => plainCosine(entry.vector, other.vector));
      const mean = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
      expect(landscape[index]?.mean).toBeCloseTo(mean, 6);
      expect(landscape[index]?.best).toBeCloseTo(Math.max(...similarities), 6);
    });
  });

  it("drops a zero vector instead of calling it similar to nothing", () => {
    const packed = packVectors([
      { id: "a", vector: [1, 0, 0] },
      { id: "zero", vector: [0, 0, 0] },
      { id: "b", vector: [0, 1, 0] },
    ]);
    expect(packed.ids).toEqual(["a", "b"]);
  });

  it("drops a vector of the wrong length rather than comparing ragged rows", () => {
    const packed = packVectors([
      { id: "a", vector: [1, 0, 0] },
      { id: "short", vector: [1, 0] },
    ]);
    expect(packed.ids).toEqual(["a"]);
  });

  it("says nothing surprising about one node, or none", () => {
    expect(similarityLandscape(packVectors([{ id: "only", vector: [1, 2, 3] }]))).toEqual([
      { mean: 0, best: 0 },
    ]);
    expect(similarityLandscape(packVectors([]))).toEqual([]);
    expect(partnersOf(packVectors([{ id: "only", vector: [1, 2, 3] }]), 0)).toEqual([]);
  });

  it("lists partners without the node itself", () => {
    const packed = packVectors(randomEntries(5, 8));
    const partners = partnersOf(packed, 2);
    expect(partners).toHaveLength(4);
    expect(partners.some((partner) => partner.id === "n2")).toBe(false);
  });
});
