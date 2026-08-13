/**
 * Purpose: the fog engine's summed-retrievability trend — same FSRS semantics as
 * retention.ts (first sighting = learning, every re-encounter = "Good"), sampled at many
 * instants without replaying each node's history from scratch per sample.
 * Main exports: computeRetentionSumSeries.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { type Card, createEmptyCard, fsrs, Rating } from "ts-fsrs";

const scheduler = fsrs();

interface RetentionCheckpoint {
  ms: number;
  card: Card;
}

/** Builds one node's FSRS checkpoints in sighting order — the card state right after each
 * sighting is applied, so a later sample can find "the state as of time T" without redoing
 * the review chain. */
function buildCheckpoints(sortedTimesIso: readonly string[]): RetentionCheckpoint[] {
  const firstTimeIso = sortedTimesIso[0];
  if (firstTimeIso === undefined) return [];
  let card = createEmptyCard(new Date(firstTimeIso));
  const checkpoints: RetentionCheckpoint[] = [];
  for (const timeIso of sortedTimesIso) {
    card = scheduler.next(card, new Date(timeIso), Rating.Good).card;
    checkpoints.push({ ms: Date.parse(timeIso), card });
  }
  return checkpoints;
}

/** Sum of every sighted node's retrievability at each of `sampleInstantsIso`. A node
 * contributes 0 to samples before its first sighting. Samples need not be pre-sorted; each
 * node's checkpoint pointer walks forward across the samples in time order, so the whole
 * function is O((sightings + samples) log samples), not O(sightings × samples). */
export function computeRetentionSumSeries(
  sightings: readonly NodeSightingRow[],
  sampleInstantsIso: readonly string[],
): number[] {
  if (sampleInstantsIso.length === 0) return [];

  const timesByNode = new Map<string, string[]>();
  for (const sighting of sightings) {
    const times = timesByNode.get(sighting.node_id) ?? [];
    times.push(sighting.created_at);
    timesByNode.set(sighting.node_id, times);
  }

  const samplesAscending = sampleInstantsIso
    .map((iso, index) => ({ ms: Date.parse(iso), index }))
    .sort((a, b) => a.ms - b.ms);

  const sums = new Array<number>(sampleInstantsIso.length).fill(0);

  for (const times of timesByNode.values()) {
    const checkpoints = buildCheckpoints([...times].sort());
    let checkpointIndex = -1;
    for (const sample of samplesAscending) {
      let nextCheckpoint = checkpoints[checkpointIndex + 1];
      while (nextCheckpoint !== undefined && nextCheckpoint.ms <= sample.ms) {
        checkpointIndex += 1;
        nextCheckpoint = checkpoints[checkpointIndex + 1];
      }
      const checkpoint = checkpoints[checkpointIndex];
      if (checkpoint === undefined) continue;
      const retrievability = scheduler.get_retrievability(
        checkpoint.card,
        new Date(sample.ms),
        false,
      );
      sums[sample.index] = (sums[sample.index] ?? 0) + Math.max(0, Math.min(1, retrievability));
    }
  }

  return sums;
}
