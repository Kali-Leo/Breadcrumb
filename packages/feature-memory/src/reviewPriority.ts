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
 * That is the fix for the ordering the 2026-08-28 design audit called reversed (D2, ruled
 * by Leo 2026-09-01): "lowest retention first" put the concepts with the least to gain, and
 * the least chance of being retold, at the head of the queue.
 * Main exports: computeNodeReviewPriority, computeNodeMemoryByNode, NodeMemory.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { type Card, fsrs, Rating } from "ts-fsrs";
import {
  buildNodeCheckpoints,
  type GradedSighting,
  groupGradedSightingsByNode,
  retrievabilityOf,
} from "./retention";

/** Same scheduler settings as the retention replay — concepts have no learning steps. */
const scheduler = fsrs({ enable_short_term: false });

/** Expected stability change, in days, of meeting this concept again right now. Higher is
 * more worth asking about today; it can go negative for a concept whose likely outcome is a
 * failure that costs more stability than the unlikely success would buy. */
function expectedStabilityGain(card: Card, now: Date): number {
  const recall = retrievabilityOf(card, now);
  const afterSuccess = scheduler.next(card, now, Rating.Good).card.stability;
  const afterFailure = scheduler.next(card, now, Rating.Again).card.stability;
  return recall * (afterSuccess - card.stability) + (1 - recall) * (afterFailure - card.stability);
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
