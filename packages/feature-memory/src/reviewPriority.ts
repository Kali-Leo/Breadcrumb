/**
 * Purpose: how much a review of one concept is worth right now — the ordering behind the
 * daily helpers who come asking about something you learned a while ago.
 * Model: the expected change in FSRS stability if the concept came up today, taken over
 * both outcomes — recall probability R times the stability a successful retrieval buys,
 * plus (1 − R) times what a failed one leaves. Nothing else: no hand-set weights, no
 * urgency floor, no rescue bonus. The expectation already says what those terms were
 * reaching for — a concept still fresh gains little (FSRS's own spacing effect), and one
 * that is nearly gone gains little either, because the likely outcome is a blank stare that
 * resets stability rather than a retrieval that consolidates it.
 * This avoids ordering by "lowest retention first", which puts the concepts with the least to
 * gain, and the least chance of being retold, at the head of the queue.
 * Main exports: computeNodeReviewPriority, computeNodeMemoryByNode, NodeMemory.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { type Card, fsrs, Rating } from "ts-fsrs";
import { finiteOr } from "./clampUnit";
import {
  buildNodeCheckpoints,
  type GradedSighting,
  groupGradedSightingsByNode,
  retrievabilityOf,
} from "./retention";

/** Same scheduler settings as the retention replay — concepts have no learning steps. */
const scheduler = fsrs({ enable_short_term: false });

/** The instant to score the card at. "Now is earlier than the card's own last review" is not
 * a corrupted database and not a programming error — it is the ordinary consequence of the
 * learner changing the system clock, of an NTP correction pulling a fast machine backwards, of
 * a dead RTC battery, of a laptop opened in a westward time zone, or of the hour daylight
 * saving gives back every autumn. ts-fsrs, however, *throws* on a negative delta_t
 * (FSRSValidationError: Invalid delta_t "-1"), and this call sits under memoryStore.refresh(),
 * so the whole memory layer would stop at the first such node: no retention, no review
 * priority, an all-fog map and no daily helpers, until the clock went forward again.
 * Treating the rollback as delta_t = 0 says the honest thing instead — "no time has passed
 * since the last review that this card knows about" — which is exactly what retrievabilityOf
 * already reported for the same instant (it clamps to 1). The two paths now agree. */
function scoringInstant(card: Card, now: Date): Date | null {
  const nowMs = now.getTime();
  const lastReview = card.last_review;
  const lastMs = lastReview?.getTime();
  const lastUsable = lastReview !== undefined && lastMs !== undefined && Number.isFinite(lastMs);
  // An unparsable `now` (or an unparsable created_at replayed into last_review) is the NaN
  // case, not the rollback case: there is no instant to score at, so there is no score.
  if (!Number.isFinite(nowMs)) return lastUsable ? lastReview : null;
  if (lastUsable && lastMs !== undefined && nowMs < lastMs) return lastReview;
  return now;
}

/** Expected stability change, in days, of meeting this concept again right now. Higher is
 * more worth asking about today; it can go negative for a concept whose likely outcome is a
 * failure that costs more stability than the unlikely success would buy. Non-finite inputs
 * (a card replayed from an unparsable timestamp) report 0 — see clampUnit.ts. */
function expectedStabilityGain(card: Card, now: Date): number {
  const at = scoringInstant(card, now);
  if (at === null) return 0;
  const recall = retrievabilityOf(card, at);
  const afterSuccess = scheduler.next(card, at, Rating.Good).card.stability;
  const afterFailure = scheduler.next(card, at, Rating.Again).card.stability;
  return finiteOr(
    recall * (afterSuccess - card.stability) + (1 - recall) * (afterFailure - card.stability),
    0,
  );
}

/** Review priority for one node given its graded sightings; 0 when it has no footprint. */
export function computeNodeReviewPriority(
  sightings: readonly GradedSighting[],
  nowIso: string,
): number {
  const checkpoints = buildNodeCheckpoints(sightings);
  const last = checkpoints[checkpoints.length - 1];
  if (last === undefined) return 0;
  return expectedStabilityGain(last.card, new Date(nowIso));
}

/** Retention and review priority for one node — both read off the same FSRS replay. */
export interface NodeMemory {
  retention: number;
  reviewPriority: number;
}

/** Every node with at least one sighting, replayed once for both numbers. */
export function computeNodeMemoryByNode(
  sightings: readonly NodeSightingRow[],
  nowIso: string,
): Map<string, NodeMemory> {
  const now = new Date(nowIso);
  const result = new Map<string, NodeMemory>();
  for (const [nodeId, graded] of groupGradedSightingsByNode(sightings)) {
    const checkpoints = buildNodeCheckpoints(graded);
    const last = checkpoints[checkpoints.length - 1];
    if (last === undefined) {
      result.set(nodeId, { retention: 0, reviewPriority: 0 });
      continue;
    }
    result.set(nodeId, {
      retention: retrievabilityOf(last.card, now),
      reviewPriority: expectedStabilityGain(last.card, now),
    });
  }
  return result;
}
