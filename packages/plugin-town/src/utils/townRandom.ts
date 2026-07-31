/**
 * Purpose: seedable uniform RNG with the exact distributions of watabou's Random.hx
 * (Lehmer LCG g=48271 mod 2^31-1), plus a swappable uniform source for host integration.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/utils/Random.hx.
 * Main exports: townRandom, setTownRandomSource.
 */

const MULTIPLIER = 48271;
const MODULUS = 2147483647;

let seed = 1;

/** Advances the internal Lehmer generator and returns the new seed. */
function nextSeed(): number {
  seed = Math.trunc((seed * MULTIPLIER) % MODULUS);
  return seed;
}

/** Default uniform source: the internal Lehmer generator mapped to [0, 1). */
function lehmerFloat(): number {
  return nextSeed() / MODULUS;
}

let uniformSource: () => number = lehmerFloat;

/**
 * Replaces the underlying uniform generator used by all townRandom distributions.
 * The source must return numbers in [0, 1).
 */
export function setTownRandomSource(source: () => number): void {
  uniformSource = source;
}

export const townRandom = {
  /**
   * Reseeds the internal Lehmer generator (pass -1 or nothing to derive from clock,
   * as in the Haxe original). Only affects the default source, not an injected one.
   */
  reset(newSeed = -1): void {
    seed = newSeed !== -1 ? newSeed : Math.trunc(Date.now() % MODULUS);
  },

  getSeed(): number {
    return seed;
  },

  float(): number {
    return uniformSource();
  },

  normal(): number {
    return (this.float() + this.float() + this.float()) / 3;
  },

  int(min: number, max: number): number {
    return Math.trunc(min + this.float() * (max - min));
  },

  bool(chance = 0.5): boolean {
    return this.float() < chance;
  },

  fuzzy(f = 1.0): number {
    return f === 0 ? 0.5 : (1 - f) / 2 + f * this.normal();
  },
};
