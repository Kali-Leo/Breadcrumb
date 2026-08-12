/**
 * Purpose: FSRS-6 card lifecycle for woven words (spec 033) — one shared scheduler,
 * JSON (de)serialization for the diglot_word_states.fsrs_json column, and the mapping
 * from implicit signal events to FSRS ratings per the spec's signal table.
 * Main exports: newWordCard, cardFromJson, cardToJson, reviewCard, ratingForSignal,
 * retrievabilityOf, EXPOSURES_PER_GOOD.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";
import { type Card, createEmptyCard, fsrs, type Grade, Rating } from "ts-fsrs";

/** One scheduler for the whole plugin; fuzz disabled so scheduling stays deterministic
 * and replayable in tests and simlab. */
const scheduler = fsrs({ enable_fuzz: false });

/** Every 3rd passive exposure without a lookup converts into one Good review — passive
 * exposure works (Broccoli RQ2) but must weigh far less than explicit retrieval. */
export const EXPOSURES_PER_GOOD = 3;

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

/** Revives a card from fsrs_json; date fields come back as Date objects. */
export function cardFromJson(json: string): Card {
  const raw = JSON.parse(json) as Card & { due: string; last_review?: string };
  return {
    ...raw,
    due: new Date(raw.due),
    last_review: raw.last_review === undefined ? undefined : new Date(raw.last_review),
  };
}

/** Applies one FSRS review and returns the next card. */
export function reviewCard(card: Card, now: Date, rating: Grade): Card {
  return scheduler.next(card, now, rating).card;
}

/** Recall probability of the card at `now` (0..1). */
export function retrievabilityOf(card: Card, now: Date): number {
  const retrievability = scheduler.get_retrievability(card, now, false);
  return Math.max(0, Math.min(1, retrievability));
}

/** The spec's signal table: which FSRS rating (if any) one event applies.
 * `priorEvents` are the word's events newest-first, BEFORE the current one.
 * - exposure: every EXPOSURES_PER_GOODth consecutive exposure since the last
 *   non-exposure event rates Good, others rate nothing;
 * - hover: Again (the reader needed the meaning);
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
