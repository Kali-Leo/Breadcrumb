/**
 * Purpose: pins mulberry32's stream and the seeded shuffle's permutation. The three former
 * copies differed only in whether the state was kept with `| 0` or `>>> 0`; this file asserts
 * the two spellings produce the identical sequence, which is why merging them was safe.
 */
import { describe, expect, it } from "vitest";
import { fnv1a32 } from "./hash";
import { mulberry32, seededShuffle } from "./prng";

/** simlab's former spelling: signed state, same 32-bit pattern. */
function mulberry32Signed(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("mulberry32", () => {
  it("replays the same sequence for the same seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays in [0, 1) and diverges across seeds", () => {
    const random = mulberry32(42);
    for (let index = 0; index < 200; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("matches the signed-state spelling bit for bit", () => {
    for (const seed of [0, 1, 42, 0x811c9dc5, fnv1a32("知识点"), -7]) {
      const unsigned = mulberry32(seed);
      const signed = mulberry32Signed(seed);
      for (let index = 0; index < 50; index += 1) expect(unsigned()).toBe(signed());
    }
  });
});

describe("seededShuffle", () => {
  it("permutes without losing or duplicating items", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...seededShuffle(items, "claim")].sort((a, b) => a - b)).toEqual(items);
  });

  it("is reproducible per seed source and leaves the input untouched", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(seededShuffle(items, "claim")).toEqual(seededShuffle(items, "claim"));
    expect(seededShuffle(items, "claim")).not.toEqual(seededShuffle(items, "other claim"));
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("handles the degenerate sizes", () => {
    expect(seededShuffle([], "x")).toEqual([]);
    expect(seededShuffle(["only"], "x")).toEqual(["only"]);
  });
});
