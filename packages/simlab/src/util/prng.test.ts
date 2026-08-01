/**
 * Purpose: unit tests for the shared seeded PRNG utilities.
 */
import { describe, expect, it } from "vitest";
import { mulberry32, pickWeighted, randomFloat, randomInt, seedFromStrings } from "./prng";

describe("mulberry32", () => {
  it("is deterministic and stays within [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i += 1) {
      const va = a();
      const vb = b();
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });
});

describe("seedFromStrings", () => {
  it("is deterministic and sensitive to every part", () => {
    expect(seedFromStrings(["a", "1"])).toBe(seedFromStrings(["a", "1"]));
    expect(seedFromStrings(["a", "1"])).not.toBe(seedFromStrings(["a", "2"]));
    expect(seedFromStrings(["a", "1"])).not.toBe(seedFromStrings(["b", "1"]));
  });
});

describe("randomInt", () => {
  it("stays within [min, max] inclusive across many draws", () => {
    const random = mulberry32(42);
    for (let i = 0; i < 200; i += 1) {
      const value = randomInt(random, 2, 8);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(8);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("can return both endpoints of a small range", () => {
    const random = mulberry32(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(randomInt(random, 0, 1));
    expect(seen).toEqual(new Set([0, 1]));
  });
});

describe("randomFloat", () => {
  it("stays within [min, max)", () => {
    const random = mulberry32(9);
    for (let i = 0; i < 100; i += 1) {
      const value = randomFloat(random, 16, 40);
      expect(value).toBeGreaterThanOrEqual(16);
      expect(value).toBeLessThan(40);
    }
  });
});

describe("pickWeighted", () => {
  it("always picks the only item when it's alone", () => {
    const random = mulberry32(3);
    expect(pickWeighted(random, [{ item: "only", weight: 1 }])).toBe("only");
  });

  it("never picks a zero-weight item", () => {
    const random = mulberry32(11);
    for (let i = 0; i < 200; i += 1) {
      const picked = pickWeighted(random, [
        { item: "never", weight: 0 },
        { item: "always", weight: 1 },
      ]);
      expect(picked).toBe("always");
    }
  });

  it("distribution roughly matches the given weights over many draws", () => {
    const random = mulberry32(123);
    const counts = { a: 0, b: 0 };
    const draws = 4000;
    for (let i = 0; i < draws; i += 1) {
      const picked = pickWeighted(random, [
        { item: "a" as const, weight: 3 },
        { item: "b" as const, weight: 1 },
      ]);
      counts[picked] += 1;
    }
    // Expect roughly 75/25 split; generous tolerance since this is a statistical check.
    expect(counts.a / draws).toBeGreaterThan(0.65);
    expect(counts.a / draws).toBeLessThan(0.85);
  });
});
