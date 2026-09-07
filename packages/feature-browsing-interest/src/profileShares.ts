/**
 * Purpose: turn the raw accumulators into the shares a person can read — each vector
 * sum-normalised, the exposure correction, the declared preferences, and the affinity score the
 * recommender consumes. Nothing here mutates the profile except `setTopicPreference`.
 *
 * Ported from Kali-Leo/feed-mode, GPL-3.0, same copyright holder; modified 2026-09-07
 * (Python/JavaScript → TypeScript). Sources: `interest-model/daemon/app.py:265-269` (`dists`)
 * and `app.py:473` (`lift`); `interest-model/lite/interest_lite.js:82-96` (`nz`, `setPref`,
 * `affinity`).
 *
 * `exposureLift` is the one number here that is not just a rescaling: chosen share divided by
 * fed share. Above 1 the learner sought the topic out beyond what the feed pushed at them;
 * below 1 they mostly got fed it. Without it, a profile built from a recommender's output can
 * only ever agree with that recommender.
 * Main exports: normalizeShares, profileDistributions, exposureLift, setTopicPreference,
 * topicAffinity, topDriverTopics.
 */
import type { InterestProfileState } from "./profileEngine";
import { TOPIC_LEAVES } from "./taxonomy";

/** Declared preference bounds (interest_lite.js:86). */
export const MIN_TOPIC_PREFERENCE = -2;
export const MAX_TOPIC_PREFERENCE = 2;

/**
 * Floor on the exposure denominator (app.py:473). A topic the feed has barely shown must not
 * divide a real interest by ~0 and report an infinite lift.
 */
export const MIN_EXPOSURE_SHARE = 0.005;

/** Sum-normalises a vector; an all-zero vector is returned unchanged rather than as NaNs. */
export function normalizeShares(vector: readonly number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value;
  return sum > 0 ? vector.map((value) => value / sum) : [...vector];
}

export interface ProfileDistributions {
  readonly short: number[];
  readonly long: number[];
  readonly expose: number[];
}

/** The three accumulators as shares that each sum to 1. */
export function profileDistributions(state: InterestProfileState): ProfileDistributions {
  return {
    short: normalizeShares(state.short),
    long: normalizeShares(state.long),
    expose: normalizeShares(state.expose),
  };
}

/** Chosen share ÷ fed share, per topic, rounded to two decimals as the source does. */
export function exposureLift(distributions: ProfileDistributions): number[] {
  return distributions.short.map((share, index) => {
    const exposed = Math.max(distributions.expose[index] ?? 0, MIN_EXPOSURE_SHARE);
    return Math.round((share / exposed) * 100) / 100;
  });
}

/**
 * Records a declared preference for a topic, clamped to −2..+2. Unknown topic names are
 * ignored — the vector layout is fixed, and inventing a slot for a typo would silently produce
 * a preference nothing ever reads.
 */
export function setTopicPreference(
  state: InterestProfileState,
  topic: string,
  value: number,
): boolean {
  if (!TOPIC_LEAVES.includes(topic)) return false;
  state.prefs[topic] = Math.max(MIN_TOPIC_PREFERENCE, Math.min(MAX_TOPIC_PREFERENCE, value));
  return true;
}

/**
 * How much this content matches the learner, for ranking and filtering downstream. Behaviour
 * (the long-term share) plus half of any declared preference, weighted by the content's own
 * topic distribution — so a declaration outranks behaviour without erasing it: at the extreme,
 * ±1.0 of preference against long-term shares that are all below 1 by construction.
 */
export function topicAffinity(
  state: InterestProfileState,
  probabilities: readonly number[],
): number {
  const long = normalizeShares(state.long);
  let affinity = 0;
  for (let i = 0; i < TOPIC_LEAVES.length; i++) {
    const preference = state.prefs[TOPIC_LEAVES[i] ?? ""] ?? 0;
    affinity += (probabilities[i] ?? 0) * ((long[i] ?? 0) + 0.5 * preference);
  }
  return affinity;
}

/**
 * The `count` topic indices with the largest long-term share, largest first — the topics the
 * profile is actually made of, which the profile panel then illustrates with real titles.
 */
export function topDriverTopics(distributions: ProfileDistributions, count: number): number[] {
  return distributions.long
    .map((share, index) => ({ share, index }))
    .sort((a, b) => b.share - a.share || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.index);
}
