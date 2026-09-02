/**
 * Purpose: the adaptive conversation:browsing trust ratio (spec 060 §5) — hindsight
 * validation turns "which signal actually predicted what the learner went on to study" into
 * the ratio the frontier uses, replacing the fixed 2:1 stance once real outcomes accumulate.
 * This module is the pure half: percentile ranking and the guarded ratio estimate. The app
 * assembles the per-event history (it owns the rows and the embeddings).
 * Main exports: hindsightTrustRatio, midrankPercentile, HindsightEvent,
 * BROWSING_TRUST_DEFAULT, BROWSING_TRUST_MIN, BROWSING_TRUST_MAX.
 */

/** Cold-start stance (spec 059): browsing speaks at half the conversational weight. */
export const BROWSING_TRUST_DEFAULT = 0.5;
/** The adaptive floor — browsing never goes fully mute on its own. */
export const BROWSING_TRUST_MIN = 0.1;
/** Product stance ceiling (Leo-confirmed 2026-08-31): a platform-fed signal never outvotes
 * what the learner said in conversation, however well it predicts. */
export const BROWSING_TRUST_MAX = 1;
/** Below this many first-touch outcomes the estimate would be noise — keep the default. */
export const MIN_OUTCOME_EVENTS = 30;
/** Predictive skill is percentile-above-chance; interest skill under this floor means there
 * is no yardstick to form a ratio against — keep the default. */
const MIN_INTEREST_SKILL = 0.02;
const CHANCE_PERCENTILE = 0.5;

/** One "the learner went on to study a new node" outcome: the touched node's percentile
 * under each signal among the then-untouched pool (midrank, higher = better predicted). */
export interface HindsightEvent {
  interestPercentile: number;
  browsingPercentile: number;
}

/** Midrank percentile of `target` inside `values` (which includes it conceptually or not —
 * caller passes the pool's scores plus the target's own score separately). Ties share their
 * average rank, so a signal that scores everything 0 lands at chance, not at the top. */
export function midrankPercentile(poolScores: readonly number[], targetScore: number): number {
  if (poolScores.length === 0) return CHANCE_PERCENTILE;
  let below = 0;
  let tied = 0;
  for (const score of poolScores) {
    if (score < targetScore) below += 1;
    else if (score === targetScore) tied += 1;
  }
  return (below + (tied + 1) / 2) / (poolScores.length + 1);
}

/**
 * The ratio itself: mean percentile skill above chance per signal, ratio of skills, clamped
 * to [BROWSING_TRUST_MIN, BROWSING_TRUST_MAX]. Falls back to BROWSING_TRUST_DEFAULT when
 * outcomes are too few or conversational interest itself shows no skill (nothing to compare
 * against). Deterministic, zero LLM.
 */
export function hindsightTrustRatio(events: readonly HindsightEvent[]): number {
  if (events.length < MIN_OUTCOME_EVENTS) return BROWSING_TRUST_DEFAULT;
  const mean = (pick: (event: HindsightEvent) => number) =>
    events.reduce((sum, event) => sum + pick(event), 0) / events.length;
  const interestSkill = mean((event) => event.interestPercentile) - CHANCE_PERCENTILE;
  const browsingSkill = mean((event) => event.browsingPercentile) - CHANCE_PERCENTILE;
  if (interestSkill < MIN_INTEREST_SKILL) return BROWSING_TRUST_DEFAULT;
  const ratio = Math.max(0, browsingSkill) / interestSkill;
  if (!Number.isFinite(ratio)) return BROWSING_TRUST_DEFAULT;
  return Math.min(BROWSING_TRUST_MAX, Math.max(BROWSING_TRUST_MIN, ratio));
}
