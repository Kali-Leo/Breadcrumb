/**
 * Purpose: deterministic randomness for the ranked-ladder engine (spec 018 2026-08-04 revision)
 * — an FNV-1a string hash into a 32-bit seed plus the mulberry32 PRNG, so a goal id or a rank
 * number always derives the exact same "random" sequence. Deliberately a self-contained copy of
 * the same public-domain algorithm already used by packages/plugin-map/src/random.ts (kept
 * local rather than imported, since a headless rank/fuel engine has no business depending on the
 * procedural-cartography package for an unrelated math primitive — CLAUDE.md's locality rule).
 * Main exports: hashStringToSeed, createSeededRandom, SeededRandom.
 */

export type SeededRandom = () => number;

export function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny, fast, and good enough distribution for cosmetic randomness. Returns a
 * function yielding floats in [0, 1). */
export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
