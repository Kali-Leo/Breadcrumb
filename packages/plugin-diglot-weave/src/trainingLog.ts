/**
 * Purpose: turns the diglot event log into fsrs-rs training data (vision/09 #1) — replays
 * the exact production signal→rating mapping per word, then emits review-prefix items in
 * the optimizer's convention (first review delta_t = 0, item terminals need delta_t > 0).
 * Main exports: buildTrainingItems, MIN_REVIEWS_FOR_FITTING, TrainingItem.
 */
import type { DiglotEventKind, DiglotWordEventRow } from "@breadcrumb/core-db";
import { ratingForSignal } from "./memoryState";

/** Reviews required before fitting personal parameters. Anki removed its hard minimum in
 * 24.06.3 (400 was the 24.04 version's gate), so this is our own floor, not a citation: it
 * buys robustness against the synthetic ratings this log is made of — exposures folded into
 * Good carry far less information per row than a real Anki answer. */
export const MIN_REVIEWS_FOR_FITTING = 400;

export interface TrainingReview {
  rating: number;
  delta_t: number;
}

export interface TrainingItem {
  reviews: TrainingReview[];
}

/** Replays one word's events through the production rating mapping, producing its rated
 * review sequence with day-granular deltas. */
function reviewsForWord(eventsAsc: readonly DiglotWordEventRow[]): TrainingReview[] {
  const priorKinds: DiglotEventKind[] = [];
  let reps = 0;
  let lastRatedMs: number | null = null;
  const reviews: TrainingReview[] = [];
  for (const event of eventsAsc) {
    const rating = ratingForSignal(event.kind, priorKinds, event.latency_ms ?? undefined, reps);
    priorKinds.unshift(event.kind);
    if (priorKinds.length > 8) priorKinds.pop();
    if (rating === null) continue;
    const eventMs = new Date(event.created_at).getTime();
    const deltaDays =
      lastRatedMs === null ? 0 : Math.max(0, Math.round((eventMs - lastRatedMs) / 86400000));
    reviews.push({ rating, delta_t: deltaDays });
    lastRatedMs = eventMs;
    reps += 1;
  }
  return reviews;
}

/** Builds the optimizer's train set from all events of one pair, plus the total rated
 * review count (the fitting threshold metric). */
export function buildTrainingItems(events: readonly DiglotWordEventRow[]): {
  items: TrainingItem[];
  reviewCount: number;
} {
  const byLemma = new Map<string, DiglotWordEventRow[]>();
  for (const event of events) {
    const forLemma = byLemma.get(event.lemma) ?? [];
    forLemma.push(event);
    byLemma.set(event.lemma, forLemma);
  }
  const items: TrainingItem[] = [];
  let reviewCount = 0;
  for (const eventsAsc of byLemma.values()) {
    // Same-day repeats are dropped (the first review keeps its conventional delta_t = 0):
    // fsrs-rs and the srs-benchmark corpus both exclude same-day reviews, and this log
    // produces plenty of them — several exposures of one word inside one reading session.
    // Dropping them is lossless for the surviving deltas, which are day-granular anyway.
    const reviews = reviewsForWord(eventsAsc).filter(
      (review, index) => index === 0 || review.delta_t > 0,
    );
    reviewCount += reviews.length;
    for (let index = 1; index < reviews.length; index += 1) {
      items.push({ reviews: reviews.slice(0, index + 1) });
    }
  }
  return { items, reviewCount };
}
