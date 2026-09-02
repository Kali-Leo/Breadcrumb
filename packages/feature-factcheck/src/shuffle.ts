/**
 * Purpose: deterministic evidence ordering. LLM judges carry a position bias strong enough
 * to reach a 75% first-slot preference (arXiv:2606.19544), so the order evidence reaches the
 * judge must not be the order the providers happened to return it in. Seeding from the claim
 * text keeps the same claim reproducible across runs. FNV-1a + mulberry32, the same pair
 * packages/feature-map/src/random.ts uses (copied rather than imported: a fact-check module
 * has no business depending on the map module).
 * Main exports: hashStringToSeed, seededShuffle.
 */

export function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, driven by a seed derived from `seedSource`. */
export function seededShuffle<T>(items: readonly T[], seedSource: string): T[] {
  const shuffled = [...items];
  const random = createSeededRandom(hashStringToSeed(seedSource));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const held = shuffled[index] as T;
    shuffled[index] = shuffled[target] as T;
    shuffled[target] = held;
  }
  return shuffled;
}
