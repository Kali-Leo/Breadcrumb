/**
 * Purpose: the fog engine — FSRS-based memory retention per knowledge node.
 * Model: every sighting is one FSRS review, rated by the sighting's own grade — a passive
 * mention lands as "Good", a graded retrieval lands as Again/Hard/Easy. Retention is the FSRS
 * retrievability at `now`. Pure and local; zero cost.
 * Main exports: computeNodeRetention, computeRetentionByNode, buildNodeCheckpoints,
 * gradedSightingsOf, retrievabilityOf, NodeRetentionCheckpoint, GradedSighting.
 */
import type { NodeSightingGrade, NodeSightingRow } from "@breadcrumb/core-db";
import { type Card, createEmptyCard, fsrs, type Grade, Rating } from "ts-fsrs";

// enable_short_term is stated explicitly (design audit 2026-08-28 #7): the library default is
// true, which parks a just-reviewed card in the Learning state on learning-step intervals.
// There is no such thing as a learning step on the concept side — a sighting is a review of a
// concept met in conversation, never a card being drilled — so the scheduler is told so
// instead of depending on the default happening to be harmless.
const scheduler = fsrs({ enable_short_term: false });

/** The four sighting grades are the four FSRS ratings; `Rating.Manual` has no counterpart here. */
const RATING_BY_GRADE: Record<NodeSightingGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** One sighting reduced to what FSRS consumes: when it happened, and how well the learner
 * retrieved the concept then. */
export interface GradedSighting {
  createdAtIso: string;
  grade: NodeSightingGrade;
}

/** One node's FSRS card state at a checkpoint instant — the state right after that
 * sighting was applied as a review, so a later query can find "the state as of time T"
 * without replaying the whole review chain from scratch. */
export interface NodeRetentionCheckpoint {
  ms: number;
  card: Card;
}

/** Sighting rows → the graded pairs the FSRS replay consumes. A row with no grade was built in
 * memory before insert (never read back from SQLite, where the column is NOT NULL) and counts
 * as the passive exposure the insert path would have written for it. */
export function gradedSightingsOf(sightings: readonly NodeSightingRow[]): GradedSighting[] {
  return sightings.map((sighting) => ({
    createdAtIso: sighting.created_at,
    grade: sighting.grade ?? "good",
  }));
}

/** Builds one node's FSRS checkpoints in time order, each sighting applied as a review at its
 * own grade — shared by every consumer that samples retention (or stability) at many instants
 * instead of just "now". */
export function buildNodeCheckpoints(
  sightings: readonly GradedSighting[],
): NodeRetentionCheckpoint[] {
  // Lexicographic string order is time order here because nowIso() only ever emits the UTC-Z,
  // millisecond-precision ISO form ("2026-08-28T09:41:07.123Z"): fixed width, fixed offset, so
  // byte order is chronological. A local-offset or second-precision timestamp written into
  // created_at would silently break this — nothing writes one.
  const sorted = [...sightings].sort((a, b) =>
    a.createdAtIso < b.createdAtIso ? -1 : a.createdAtIso > b.createdAtIso ? 1 : 0,
  );
  const first = sorted[0];
  if (first === undefined) return [];
  let card = createEmptyCard(new Date(first.createdAtIso));
  const checkpoints: NodeRetentionCheckpoint[] = [];
  for (const sighting of sorted) {
    const at = new Date(sighting.createdAtIso);
    card = scheduler.next(card, at, RATING_BY_GRADE[sighting.grade]).card;
    checkpoints.push({ ms: at.getTime(), card });
  }
  return checkpoints;
}

/** Recall probability (0..1) of one card at an instant — the one place the fog engine's FSRS
 * retrievability call lives, so retention, the layer series and review priority always read it
 * the same way. Clamped here rather than at each call site: every consumer treats it as a
 * probability, so an out-of-range value from the library must never reach one of them. */
export function retrievabilityOf(card: Card, now: Date): number {
  return Math.max(0, Math.min(1, scheduler.get_retrievability(card, now, false)));
}

/** Retention probability (0..1) for one node given its graded sightings. */
export function computeNodeRetention(sightings: readonly GradedSighting[], nowIso: string): number {
  const checkpoints = buildNodeCheckpoints(sightings);
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  if (lastCheckpoint === undefined) return 0;
  return retrievabilityOf(lastCheckpoint.card, new Date(nowIso));
}

/** Sighting rows regrouped per node, each node's list in the order the rows arrived. */
export function groupGradedSightingsByNode(
  sightings: readonly NodeSightingRow[],
): Map<string, GradedSighting[]> {
  const byNode = new Map<string, GradedSighting[]>();
  for (const sighting of sightings) {
    const forNode = byNode.get(sighting.node_id) ?? [];
    forNode.push({ createdAtIso: sighting.created_at, grade: sighting.grade ?? "good" });
    byNode.set(sighting.node_id, forNode);
  }
  return byNode;
}

/** Retention for every node that has at least one sighting. */
export function computeRetentionByNode(
  sightings: readonly NodeSightingRow[],
  nowIso: string,
): Map<string, number> {
  return new Map(
    [...groupGradedSightingsByNode(sightings).entries()].map(([nodeId, graded]) => [
      nodeId,
      computeNodeRetention(graded, nowIso),
    ]),
  );
}
