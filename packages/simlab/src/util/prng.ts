/**
 * Purpose: shared deterministic randomness — a seeded mulberry32 PRNG plus small range
 * helpers, used by persona perturbation and the journey runner's action/timing choices.
 * Library code must never call Math.random(); everything traces back to a seed.
 * Main exports: mulberry32, seedFromStrings, randomInt, pickWeighted.
 */

/** mulberry32: a small, fast, well-known 32-bit seeded PRNG. Returns a function yielding
 * successive floats in [0, 1); same seed -> same sequence, always. */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combines any number of strings into one 32-bit seed via FNV-1a, so distinct input tuples
 * get distinct-but-reproducible PRNG streams. */
export function seedFromStrings(parts: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/** A uniformly-distributed integer in [min, max] (inclusive on both ends). */
export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** A uniformly-distributed float in [min, max). */
export function randomFloat(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Picks one item by weight (weights need not sum to 1 — they're normalized here). Falls
 * back to the last item on floating-point edge cases so this never returns undefined. */
export function pickWeighted<Item>(
  random: () => number,
  items: readonly { item: Item; weight: number }[],
): Item {
  const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * totalWeight;
  for (const entry of items) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return (items[items.length - 1] as { item: Item }).item;
}
