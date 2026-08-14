/**
 * Purpose: concept guess-gate probability (spec 039 §2.2) — ported from the diglot weave
 * guess policy (spec 033, packages/plugin-diglot-weave/src/guessPolicy.ts), stripped of the
 * user-visible level dial: the mechanism does not surface tiers, so the base probability is
 * fixed at the former "standard" level (0.25).
 * Main exports: computeConceptGateProbability, ConceptGateInput.
 */

/** Probability for a brand-new node's first encounter: a pure pretest — guessing before
 * any exposure improves later encoding even when the guess is wrong (Potts & Shanks). */
const NEW_NODE_PROBABILITY = 0.1;
/** Hard ceiling so opening a door never feels like a quiz gauntlet. */
const PROBABILITY_CEILING = 0.6;
/** A summary revealed this recently means asking now has near-zero information value. */
const RECENT_REVEAL_MS = 60 * 60 * 1000;
/** Fixed base probability — the mechanism has no user-visible dial (spec 039 §2.2). */
const BASE_PROBABILITY = 0.25;

export interface ConceptGateInput {
  /** FSRS retention 0..1, or null when the node has never been sighted (first encounter). */
  retention: number | null;
  /** True when the node has ever produced an explicit signal (mastery claim or a prior
   * concept guess); false = only weak exposure data, so a guess is maximally informative. */
  hasExplicitSignal: boolean;
  /** When this node's summary was last revealed to the user, or null. */
  lastRevealAt: Date | null;
  now: Date;
  /** How many of the user's latest guess prompts (across all nodes) were abandoned —
   * three in a row halves everything: the user is telling us "not now". */
  recentConsecutiveAbandons: number;
}

/** Multiplier by recall band: the 0.5–0.85 retrieval-effort band teaches most, nearly
 * certain recall (>0.95) is rarely worth interrupting, likely-failure (<0.5) is somewhat
 * informative but frustrating, so it sits below 1. */
function recallBandFactor(retention: number): number {
  if (retention > 0.95) return 0.4;
  if (retention >= 0.85) return 1;
  if (retention >= 0.5) return 1.5;
  return 0.8;
}

/** The probability that opening this door starts with a guess card instead of the summary. */
export function computeConceptGateProbability(input: ConceptGateInput): number {
  if (
    input.lastRevealAt !== null &&
    input.now.getTime() - input.lastRevealAt.getTime() < RECENT_REVEAL_MS
  ) {
    return 0;
  }
  const damp = input.recentConsecutiveAbandons >= 3 ? 0.5 : 1;
  if (input.retention === null) {
    return Math.min(NEW_NODE_PROBABILITY * damp, PROBABILITY_CEILING);
  }
  const band = recallBandFactor(input.retention);
  const starvation = input.hasExplicitSignal ? 1 : 1.5;
  return Math.min(BASE_PROBABILITY * band * starvation * damp, PROBABILITY_CEILING);
}
