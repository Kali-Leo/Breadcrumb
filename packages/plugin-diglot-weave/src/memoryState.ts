/**
 * Purpose: FSRS-6 card lifecycle for woven words (spec 033) — one scheduler instance per
 * language pair, JSON (de)serialization for the diglot_word_states.fsrs_json column, and
 * the mapping from implicit signal events to FSRS ratings per the spec's signal table.
 * Main exports: newWordCard, cardFromJson, cardToJson, reviewCard, ratingForSignal,
 * retrievabilityOf, configureDiglotScheduler, EXPOSURES_PER_GOOD.
 */
import type { DiglotEventKind, DiglotPairId } from "@breadcrumb/core-db";
import { parseJsonColumn } from "@breadcrumb/core-db";
import { type Card, createEmptyCard, type FSRS, fsrs, type Grade, Rating, State } from "ts-fsrs";
import { z } from "zod";

/** One scheduler instance per language pair — personally fitted parameters (vision/09 #1)
 * are per-pair, so a shared singleton would cross-contaminate scheduling the moment a
 * second pair exists. Fuzz disabled so scheduling stays deterministic and replayable in
 * tests and simlab. ts-fsrs instances are cheap, so lazy per-pair creation is fine. */
const schedulersByPair = new Map<DiglotPairId, FSRS>();

function schedulerFor(pairId: DiglotPairId): FSRS {
  const existing = schedulersByPair.get(pairId);
  if (existing !== undefined) return existing;
  const created = fsrs({ enable_fuzz: false });
  schedulersByPair.set(pairId, created);
  return created;
}

/** Swaps in personally fitted FSRS parameters (21 weights) for one pair; no `w` restores
 * that pair's default. Other pairs are unaffected. */
export function configureDiglotScheduler(pairId: DiglotPairId, w?: readonly number[]): void {
  schedulersByPair.set(
    pairId,
    fsrs(w === undefined ? { enable_fuzz: false } : { enable_fuzz: false, w: [...w] }),
  );
}

/** Every 2nd passive exposure without a lookup converts into one Good review — passive
 * exposure works (Broccoli RQ2: retention without any clicking) but should weigh less
 * than explicit retrieval. (3 starved throughput: words never graduated and review debt
 * saturated the whole vocabulary — 30-day journey sim.) */
export const EXPOSURES_PER_GOOD = 2;

/** A word's first few lookups are the teaching moment, not retrieval failure — punishing
 * them with Again traps fresh words in a permanent short-interval loop (journey sim). */
const HOVER_GRACE_REVIEWS = 3;

/** A guess counted as Easy needs to be exact-grade and faster than this (spec 033). */
const FAST_GUESS_MS = 5000;

/** Fresh card for a word introduced right now. */
export function newWordCard(now: Date): Card {
  return createEmptyCard(now);
}

/** Serializes a card for the fsrs_json column (dates become ISO strings). */
export function cardToJson(card: Card): string {
  return JSON.stringify(card);
}

/** The stored shape of the fsrs_json column: a ts-fsrs Card whose Dates went through
 * JSON.stringify and came back as ISO strings. Dates are checked for actual parseability
 * rather than merely for being strings — an Invalid Date does not throw, it quietly makes
 * every interval NaN and poisons the whole schedule. The two fields carrying defaults are
 * the ones ts-fsrs has changed across minor versions (`elapsed_days` is deprecated,
 * `learning_steps` arrived in 5.x): a card written by an older build must still revive. */
const StoredCardSchema = z.object({
  due: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  elapsed_days: z.number().finite().default(0),
  scheduled_days: z.number().finite(),
  learning_steps: z.number().finite().default(0),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.enum(State),
  last_review: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)))
    .optional(),
});

/** Revives a card from fsrs_json; date fields come back as Date objects. Null when the column
 * does not hold a card — the caller drops that one word rather than scheduling on NaN. */
export function cardFromJson(json: string): Card | null {
  const raw = parseJsonColumn(StoredCardSchema, json);
  if (raw === null) return null;
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review === undefined ? undefined : new Date(raw.last_review),
  };
}

/** Applies one FSRS review and returns the next card, scheduled by `pairId`'s scheduler. */
export function reviewCard(pairId: DiglotPairId, card: Card, now: Date, rating: Grade): Card {
  return schedulerFor(pairId).next(card, now, rating).card;
}

/** Recall probability of the card at `now` (0..1), evaluated by `pairId`'s scheduler. */
export function retrievabilityOf(pairId: DiglotPairId, card: Card, now: Date): number {
  const retrievability = schedulerFor(pairId).get_retrievability(card, now, false);
  return Math.max(0, Math.min(1, retrievability));
}

/** The spec's signal table: which FSRS rating (if any) one event applies.
 * `priorEvents` are the word's events newest-first, BEFORE the current one.
 * - exposure: every EXPOSURES_PER_GOODth consecutive exposure since the last
 *   non-exposure event rates Good, others rate nothing;
 * - hover: Again (the reader needed the meaning) — except during a young card's first
 *   few reviews (`cardReps < HOVER_GRACE_REVIEWS`), where looking up is expected and
 *   rates nothing;
 * - audio: no extra rating — the hover that opened the card already carried the failure
 *   signal, double-punishing would bias the model (the event is still logged);
 * - guesses: correct = Good (Easy when fast), close = Hard (partial retrieval),
 *   wrong/abandoned = Again;
 * - productive_use: Easy (the strongest signal there is).
 */
export function ratingForSignal(
  kind: DiglotEventKind,
  priorEventKinds: readonly DiglotEventKind[],
  guessLatencyMs?: number,
  cardReps?: number,
): Grade | null {
  switch (kind) {
    case "exposure": {
      let consecutiveExposures = 0;
      for (const prior of priorEventKinds) {
        if (prior !== "exposure") break;
        consecutiveExposures += 1;
      }
      return (consecutiveExposures + 1) % EXPOSURES_PER_GOOD === 0 ? Rating.Good : null;
    }
    case "hover":
      if (cardReps !== undefined && cardReps < HOVER_GRACE_REVIEWS) return null;
      return Rating.Again;
    case "audio":
      return null;
    case "guess_correct":
      return guessLatencyMs !== undefined && guessLatencyMs < FAST_GUESS_MS
        ? Rating.Easy
        : Rating.Good;
    case "guess_close":
      return Rating.Hard;
    case "guess_wrong":
      return Rating.Again;
    case "guess_abandoned":
      return Rating.Again;
    case "productive_use":
      return Rating.Easy;
  }
}
