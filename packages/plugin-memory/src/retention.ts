/**
 * Purpose: the fog engine — FSRS-based memory retention per knowledge node.
 * Model: first sighting = learning review, every re-encounter = a "Good" review;
 * retention is the FSRS retrievability at `now`. Pure and local; zero cost.
 * Main exports: computeNodeRetention, computeRetentionByNode, buildNodeCheckpoints,
 * NodeRetentionCheckpoint.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { type Card, createEmptyCard, fsrs, Rating } from "ts-fsrs";

const scheduler = fsrs();

/** One node's FSRS card state at a checkpoint instant — the state right after that
 * sighting was applied as a review, so a later query can find "the state as of time T"
 * without replaying the whole review chain from scratch. */
export interface NodeRetentionCheckpoint {
  ms: number;
  card: Card;
}

/** Builds one node's FSRS checkpoints in sighting order (first sighting = learning review,
 * every following sighting = a "Good" review) — shared by every consumer that samples
 * retention (or stability) at many instants instead of just "now". */
export function buildNodeCheckpoints(
  sortedSightingTimesIso: readonly string[],
): NodeRetentionCheckpoint[] {
  const firstTimeIso = sortedSightingTimesIso[0];
  if (firstTimeIso === undefined) return [];
  let card = createEmptyCard(new Date(firstTimeIso));
  const checkpoints: NodeRetentionCheckpoint[] = [];
  for (const timeIso of sortedSightingTimesIso) {
    card = scheduler.next(card, new Date(timeIso), Rating.Good).card;
    checkpoints.push({ ms: Date.parse(timeIso), card });
  }
  return checkpoints;
}

/** Retention probability (0..1) for one node given its sighting instants. */
export function computeNodeRetention(sightingTimesIso: readonly string[], nowIso: string): number {
  if (sightingTimesIso.length === 0) return 0;
  const checkpoints = buildNodeCheckpoints([...sightingTimesIso].sort());
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  if (lastCheckpoint === undefined) return 0;
  const retention = scheduler.get_retrievability(lastCheckpoint.card, new Date(nowIso), false);
  return Math.max(0, Math.min(1, retention));
}

/** Retention for every node that has at least one sighting. */
export function computeRetentionByNode(
  sightings: readonly NodeSightingRow[],
  nowIso: string,
): Map<string, number> {
  const timesByNode = new Map<string, string[]>();
  for (const sighting of sightings) {
    const times = timesByNode.get(sighting.node_id) ?? [];
    times.push(sighting.created_at);
    timesByNode.set(sighting.node_id, times);
  }
  return new Map(
    [...timesByNode.entries()].map(([nodeId, times]) => [
      nodeId,
      computeNodeRetention(times, nowIso),
    ]),
  );
}
