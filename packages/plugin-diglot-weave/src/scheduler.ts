/**
 * Purpose: the weave scheduler (spec 033) — picks which candidate occurrences to replace
 * in one message under the density budget, maximizing expected memory gain (FSRS-6) with
 * dispersion, new-word throttle and context-novelty factors. Deterministic throughout.
 * Main exports: scheduleReplacements, adaptiveNewWordCap, ScheduleInput,
 * ScheduledReplacement, DEFAULT_DENSITY.
 */
import type { Card } from "ts-fsrs";
import { Rating } from "ts-fsrs";
import type { CandidateOccurrence } from "./candidates";
import { retrievabilityOf, reviewCard } from "./memoryState";

/** Default replacement density: 2% of word tokens. The hard ceiling is 5% (spec 033,
 * 95–98% comprehensible-input research). */
export const DEFAULT_DENSITY = 0.02;
const DENSITY_CEILING = 0.05;
/** Never weave more than this many words into one message, whatever its length. */
const MAX_PER_MESSAGE = 4;
/** Short messages below this word count are never woven (no budget). */
const MIN_WORDS_FOR_WEAVE = 20;
/** Desired retention target the urgency term pulls towards (FSRS default). */
const DESIRED_RETENTION = 0.9;

export interface ScheduleInput {
  candidates: readonly CandidateOccurrence[];
  /** FSRS cards of words already being learned, by lemma. */
  cardsByLemma: ReadonlyMap<string, Card>;
  now: Date;
  /** Word-like token count of the message (density denominator). */
  totalWordCount: number;
  /** Replacement density in (0, 0.05]. */
  density: number;
  /** How many new words may still be introduced today (see adaptiveNewWordCap). */
  newWordBudgetToday: number;
  /** Lemma → introduction rank from the pack's frequency queue (lower = sooner). */
  introductionRank: ReadonlyMap<string, number>;
  /** Lemma → context-novelty factor in [0.5, 1.5]; 1 when unknown. Computed upstream from
   * embedding similarity between this message and the word's past contexts (spec 033
   * contextual-diversity research: novel contexts teach more than repeats). */
  noveltyByLemma?: ReadonlyMap<string, number>;
}

export interface ScheduledReplacement extends CandidateOccurrence {
  kind: "review" | "new";
  score: number;
}

/** Daily new-word cap that tightens as review debt grows: base minus one per
 * `debtPerSlot` due-but-unmet words, never below zero. (5, not 10: with 10 the intake
 * only closed after debt had saturated the whole vocabulary — 30-day journey sim.) */
export function adaptiveNewWordCap(baseCap: number, reviewDebtCount: number): number {
  const debtPerSlot = 5;
  return Math.max(0, baseCap - Math.floor(reviewDebtCount / debtPerSlot));
}

/** Expected-gain score of reviewing a known word right now: relative stability growth of
 * a Good review, weighted by urgency (how far recall has fallen below the target) and by
 * context novelty, plus an overdue-rescue term — deeply forgotten words have LOW expected
 * FSRS gain and would otherwise be starved by mildly due words forever (spec 033
 * acceptance 6: the scheduler raises a word's priority the longer it waits). */
function reviewScore(card: Card, now: Date, novelty: number): number {
  const recall = retrievabilityOf(card, now);
  const urgency = Math.max(0, DESIRED_RETENTION - recall);
  const nextStability = reviewCard(card, now, Rating.Good).stability;
  const currentStability = Math.max(card.stability, 0.01);
  const relativeGain = Math.max(0, (nextStability - currentStability) / currentStability);
  const overdueDays = Math.max(0, (now.getTime() - card.due.getTime()) / 86400000);
  const rescue = Math.min(overdueDays / 14, 1) * 0.4;
  return (0.25 + urgency) * relativeGain * novelty + rescue;
}

/** The message's replacement budget: floor(words × density), capped, with a floor of one
 * slot for medium-length messages so review supply never starves on chat-sized texts. */
function budgetFor(totalWordCount: number, density: number): number {
  const boundedDensity = Math.min(Math.max(density, 0), DENSITY_CEILING);
  if (totalWordCount < MIN_WORDS_FOR_WEAVE) return 0;
  const byDensity = Math.floor(totalWordCount * boundedDensity);
  return Math.min(Math.max(byDensity, 1), MAX_PER_MESSAGE);
}

/** Picks the replacement set for one message. Deterministic: scores then lemma order break
 * ties; at most one replacement per clause; at most one new word per message. */
export function scheduleReplacements(input: ScheduleInput): ScheduledReplacement[] {
  const budget = budgetFor(input.totalWordCount, input.density);
  if (budget === 0) return [];

  const scored: ScheduledReplacement[] = [];
  for (const candidate of input.candidates) {
    const card = input.cardsByLemma.get(candidate.lemma);
    const novelty = input.noveltyByLemma?.get(candidate.lemma) ?? 1;
    if (card !== undefined) {
      scored.push({ ...candidate, kind: "review", score: reviewScore(card, input.now, novelty) });
    } else {
      const rank = input.introductionRank.get(candidate.lemma);
      if (rank === undefined || input.newWordBudgetToday <= 0) continue;
      // New words sit between the review extremes: a meaningfully overdue review still
      // wins the slot, but a freshly consolidated word (urgency ~0, tiny gain) loses to
      // growth — otherwise a Zipf-shaped chat starves the vocabulary at a handful of
      // head words (found by the 30-day journey sim). Earlier queue rank scores higher.
      scored.push({ ...candidate, kind: "new", score: 0.15 / (1 + rank / 100) });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.lemma.localeCompare(b.lemma));

  // Growth reservation (i+1): with two or more slots, one is reserved for the best new
  // word — otherwise due reviews win every slot forever and vocabulary plateaus on the
  // Zipf head (found by the 30-day journey sim). Single-slot messages stay review-first.
  const hasNewCandidate = scored.some((item) => item.kind === "new");
  const reviewCap = budget >= 2 && hasNewCandidate ? budget - 1 : budget;

  const chosen: ScheduledReplacement[] = [];
  const usedClauses = new Set<number>();
  let newWordsChosen = 0;
  let reviewsChosen = 0;
  for (const item of scored) {
    if (chosen.length >= budget) break;
    if (usedClauses.has(item.clauseIndex)) continue;
    if (item.kind === "new" && newWordsChosen >= 1) continue;
    if (item.kind === "review" && (item.score <= 0 || reviewsChosen >= reviewCap)) continue;
    chosen.push(item);
    usedClauses.add(item.clauseIndex);
    if (item.kind === "new") newWordsChosen += 1;
    else reviewsChosen += 1;
  }
  return chosen.sort((a, b) => a.start - b.start);
}
