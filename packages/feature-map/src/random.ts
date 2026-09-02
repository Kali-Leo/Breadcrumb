/**
 * Purpose: deterministic randomness — FNV-1a string hash to a 32-bit seed plus the
 * mulberry32 PRNG. Every random decision in the map derives from a node id through here.
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
