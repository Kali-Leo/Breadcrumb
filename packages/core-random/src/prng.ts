/**
 * Purpose: mulberry32 — a small, fast, well-known 32-bit seeded PRNG, plus the seeded shuffle
 * built on it. Library code must never call Math.random(): every random decision in the
 * product traces back to a seed, so the same map, the same evidence order and the same
 * perturbed persona come back on every run.
 * Main exports: mulberry32, SeededRandom, seededShuffle.
 */
import { fnv1a32 } from "./hash";

/** Successive floats in [0, 1); same seed -> same sequence, always. */
export type SeededRandom = () => number;

/** mulberry32. The state is kept as a 32-bit pattern, so seeds outside the unsigned range
 * (a signed hash, a value already xored with a mask) yield the same stream as their
 * bit-equal unsigned counterpart. */
export function mulberry32(seed: number): SeededRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, driven by a seed derived from `seedSource` — same source, same
 * permutation. Used where presentation order must not carry information (LLM judges hold a
 * position bias strong enough to reach a 75% first-slot preference), yet must stay
 * reproducible across runs. */
export function seededShuffle<T>(items: readonly T[], seedSource: string): T[] {
  const shuffled = [...items];
  const random = mulberry32(fnv1a32(seedSource));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const held = shuffled[index] as T;
    shuffled[index] = shuffled[target] as T;
    shuffled[target] = held;
  }
  return shuffled;
}
