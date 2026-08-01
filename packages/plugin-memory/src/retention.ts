/**
 * Purpose: the fog engine — FSRS-based memory retention per knowledge node.
 * Model: first sighting = learning review, every re-encounter = a "Good" review;
 * retention is the FSRS retrievability at `now`. Pure and local; zero cost.
 * Main exports: computeNodeRetention, computeRetentionByNode.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

const scheduler = fsrs();

/** Retention probability (0..1) for one node given its sighting instants. */
export function computeNodeRetention(sightingTimesIso: readonly string[], nowIso: string): number {
  if (sightingTimesIso.length === 0) return 0;
  const times = [...sightingTimesIso].sort();
  const firstTime = new Date(times[0] ?? nowIso);
  let card = createEmptyCard(firstTime);
  for (const timeIso of times) {
    card = scheduler.next(card, new Date(timeIso), Rating.Good).card;
  }
  const retention = scheduler.get_retrievability(card, new Date(nowIso), false);
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
