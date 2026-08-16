/**
 * Purpose: when to ask for a guess (spec 033) — an information-gain-driven probability,
 * not a variable-reward roll: signal-starved words and retrieval-effort-band words score
 * high, just-looked-up words score zero, repeated abandonment damps globally.
 * Main exports: computeGuessProbability, GuessPolicyInput, GUESS_LEVEL_BASE.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import type { Card } from "ts-fsrs";
import { retrievabilityOf } from "./memoryState";

/** Base probability per user-facing level (settings; "off" does not exist by design —
 * the guess gate is part of the mechanism, Leo 2026-08-12). */
export const GUESS_LEVEL_BASE = { low: 0.12, standard: 0.25, high: 0.4 } as const;
export type GuessLevel = keyof typeof GUESS_LEVEL_BASE;

/** Probability for a brand-new word's first encounter: a pure pretest — guessing before
 * any exposure improves later encoding even when the guess is wrong (Potts & Shanks). */
const NEW_WORD_PROBABILITY = 0.1;
/** Hard ceiling so hovering never feels like a quiz gauntlet. */
const PROBABILITY_CEILING = 0.6;
/** A gloss seen this recently means asking now has near-zero information value. */
const RECENT_GLOSS_MS = 60 * 60 * 1000;

export interface GuessPolicyInput {
  /** Which pair's FSRS scheduler to read recall from (memoryState.ts is per-pair). */
  pairId: DiglotPairId;
  /** The word's FSRS card, or null when this is its first encounter. */
  card: Card | null;
  now: Date;
  level: GuessLevel;
  /** True when the word has ever produced an explicit signal (guess or productive use);
   * false = the model only has weak exposure data, so a guess is maximally informative. */
  hasExplicitSignal: boolean;
  /** When the user last saw this word's gloss (hover reveal), or null. */
  lastGlossSeenAt: Date | null;
  /** How many of the user's latest guess prompts (across all words) were abandoned —
   * three in a row halves everything: the user is telling us "not now". */
  recentConsecutiveAbandons: number;
}

/** Multiplier by recall band: the 0.5–0.85 retrieval-effort band teaches most, nearly
 * certain recall (>0.95) is rarely worth interrupting, likely-failure (<0.5) is somewhat
 * informative but frustrating, so it sits below 1. */
function recallBandFactor(recall: number): number {
  if (recall > 0.95) return 0.4;
  if (recall >= 0.85) return 1;
  if (recall >= 0.5) return 1.5;
  return 0.8;
}

/** The probability that this hover opens with a guess card instead of the gloss. */
export function computeGuessProbability(input: GuessPolicyInput): number {
  if (
    input.lastGlossSeenAt !== null &&
    input.now.getTime() - input.lastGlossSeenAt.getTime() < RECENT_GLOSS_MS
  ) {
    return 0;
  }
  const damp = input.recentConsecutiveAbandons >= 3 ? 0.5 : 1;
  // reps === 0 means the card was created by this very weave: still a first encounter.
  if (input.card === null || input.card.reps === 0) {
    return Math.min(NEW_WORD_PROBABILITY * damp, PROBABILITY_CEILING);
  }
  const base = GUESS_LEVEL_BASE[input.level];
  const band = recallBandFactor(retrievabilityOf(input.pairId, input.card, input.now));
  const starvation = input.hasExplicitSignal ? 1 : 1.5;
  return Math.min(base * band * starvation * damp, PROBABILITY_CEILING);
}
