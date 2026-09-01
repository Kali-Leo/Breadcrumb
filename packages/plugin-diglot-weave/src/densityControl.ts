/**
 * Purpose: the density closed loop (audit 2026-08-28, 语言织入 #10). Density — what share of a
 * reply's words get swapped — was a constant nothing ever wrote, while every signal needed to
 * steer it was already in the database and unused.
 *
 * What it aims at: **how often the learner has to look a woven word up**, not a coverage
 * percentage. Coverage was the wrong target (spec 033 quoted the 95–98% comprehensible-input
 * line, but that is a property of the text, not a thing this app can measure); the lookup rate
 * is the thing the learner actually feels, and it is what a spaced-repetition system's desired
 * retention plays the same role for. Too few lookups means the words on offer are ones they
 * already know; too many means the reply has turned into homework.
 *
 * The ceiling comes up from 5% to 7% on the audit's reading of Holley's 1-in-15 figure, and
 * the whole thing moves slowly: one step per day, a fifth of the distance to target, so a
 * single unusual day cannot swing it.
 * Main exports: nextDensity, DENSITY_MIN, DENSITY_MAX, TARGET_LOOKUP_RATE_BAND,
 * MIN_WOVEN_WORDS_FOR_ADJUSTMENT.
 */

/** Never below this: at zero the feature would silently switch itself off. */
export const DENSITY_MIN = 0.01;
/** Raised from 5% on the audit's reading of Holley (roughly one word in fifteen). */
export const DENSITY_MAX = 0.07;
/**
 * The share of woven words the learner opens the meaning of. Below the band they are being
 * shown words they already know; above it, reading has become work. The band is wide because
 * this is a comfort setting, not a measurement.
 */
export const TARGET_LOOKUP_RATE_BAND = { low: 0.15, high: 0.35 } as const;
/** Under this many woven words in the window, the rate is noise and density does not move. */
export const MIN_WOVEN_WORDS_FOR_ADJUSTMENT = 20;
/** Fraction of the distance to the band edge taken in one day. */
const STEP_FRACTION = 0.2;

export interface DensityObservation {
  /** Woven words the learner met in the window (one per replacement shown). */
  wovenWords: number;
  /** How many of those they opened the meaning of — hover or gloss, not audio. */
  lookups: number;
}

/**
 * The density to use next, given how the current one has been going. Returns the current
 * density unchanged when the window is too thin to say anything, so a quiet week never moves
 * the setting.
 */
export function nextDensity(current: number, observation: DensityObservation): number {
  const bounded = Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, current));
  if (observation.wovenWords < MIN_WOVEN_WORDS_FOR_ADJUSTMENT) return bounded;

  const rate = observation.lookups / observation.wovenWords;
  if (rate >= TARGET_LOOKUP_RATE_BAND.low && rate <= TARGET_LOOKUP_RATE_BAND.high) return bounded;

  // Above the band: too much of the reply needs looking up, so fewer swaps. Below it: the
  // words being offered are already known, so a few more.
  const target = rate > TARGET_LOOKUP_RATE_BAND.high ? DENSITY_MIN : DENSITY_MAX;
  const moved = bounded + (target - bounded) * STEP_FRACTION;
  return Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, Number(moved.toFixed(4))));
}
