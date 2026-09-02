/**
 * Purpose: the harness's range helpers over @breadcrumb/core-random's seeded PRNG, used by
 * persona perturbation and the journey runner's action/timing choices. Library code must
 * never call Math.random(); everything traces back to a seed. mulberry32 and seedFromStrings
 * moved to core-random 2026-09-02 (this copy differed from the map module's only in keeping
 * the state signed, which yields the identical stream) and are re-exported here so the
 * harness keeps importing its randomness from one place.
 * Main exports: mulberry32, seedFromStrings, randomInt, pickWeighted.
 */

export { mulberry32, seedFromStrings } from "@breadcrumb/core-random";

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
