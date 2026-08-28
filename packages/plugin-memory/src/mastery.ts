/**
 * Purpose: the mastery estimate — FSRS retention (real footprints) as the base, topped up
 * by self-report claims that decay if never revisited. Self-report can never outweigh real
 * evidence; it only fills the gap real evidence hasn't covered yet, and a node nobody has ever
 * been observed retrieving is capped below "lit" however often it was mentioned.
 * Main exports: computeMastery, LIT_THRESHOLD, DIM_THRESHOLD, masteryTier, MasteryTier,
 * CLAIM_WEIGHT, CLAIM_HALF_LIFE_DAYS, computeClaimScore, hasRetrievalEvidence.
 */
import type {
  MasteryClaimLevel,
  MasteryClaimRow,
  NodeSightingGrade,
  NodeSightingRow,
} from "@breadcrumb/core-db";
import { computeRetentionByNode } from "./retention";

export const LIT_THRESHOLD = 0.85;
export const DIM_THRESHOLD = 0.5;

export type MasteryTier = "lit" | "dim" | "unlit";

/** Classifies a 0..1 mastery value into the three experiment-panel tiers. */
export function masteryTier(value: number): MasteryTier {
  if (value >= LIT_THRESHOLD) return "lit";
  if (value >= DIM_THRESHOLD) return "dim";
  return "unlit";
}

/** "learned" ("我学过") is stronger self-report evidence than "familiar" ("我听过"). */
export const CLAIM_WEIGHT: Record<MasteryClaimLevel, number> = {
  learned: 0.6,
  familiar: 0.4,
  // Teach-back quality judgments (vision/09 #2): explaining well is behavioral evidence,
  // stronger than any self-report; a surface-level retelling still beats a bare claim.
  taught_principled: 0.85,
  taught_surface: 0.5,
};
/** A never-revisited self-report claim itself fades — cold-start evidence isn't permanent. */
export const CLAIM_HALF_LIFE_DAYS = 30;

/** Grades that mean the learner was actually observed producing the concept: a guess the
 * embedding grader accepted ('easy') or half-accepted ('hard'). A plain 'good' is passive
 * exposure — the concept was merely mentioned. An 'again' is an observed retrieval *failure*,
 * which is why it does not count as evidence of mastery either. */
const RETRIEVAL_GRADES: ReadonlySet<NodeSightingGrade> = new Set<NodeSightingGrade>([
  "hard",
  "easy",
]);

/** Claim levels that come from a judged teach-back rather than the learner's own say-so. */
const RETRIEVAL_CLAIM_LEVELS: ReadonlySet<MasteryClaimLevel> = new Set([
  "taught_principled",
  "taught_surface",
]);

/** True when this node has at least one observed successful retrieval — a graded guess or an
 * accepted teach-back. Exported so downstream consumers can tell "3 real retrievals" apart
 * from "mentioned once", which a bare number cannot (design audit 掌握度评估 G3). */
export function hasRetrievalEvidence(
  sightings: readonly NodeSightingRow[],
  claims: readonly MasteryClaimRow[],
): boolean {
  if (sightings.some((sighting) => RETRIEVAL_GRADES.has(sighting.grade ?? "good"))) return true;
  return claims.some((claim) => RETRIEVAL_CLAIM_LEVELS.has(claim.level));
}

/** Mastery (0..1) per node that has at least one sighting or claim. Nodes with neither are
 * absent from the map (callers treat a missing entry as 0, i.e. "unlit"). */
export function computeMastery(
  sightings: readonly NodeSightingRow[],
  claims: readonly MasteryClaimRow[],
  nowIso: string,
  /** Retention the caller has already computed for the same footprints — injected purely to
   * skip a second full FSRS replay (memoryStore keeps one cached). Omit it and this function
   * replays `sightings` itself; pass a map built from a different footprint set and the two
   * halves of the estimate stop agreeing. */
  precomputedRetentionByNode?: ReadonlyMap<string, number>,
): Map<string, number> {
  const retentionByNode = precomputedRetentionByNode ?? computeRetentionByNode(sightings, nowIso);
  const claimsByNode = groupClaimsByNode(claims);
  const sightingsByNode = groupSightingsByNode(sightings);
  const nodeIds = new Set([...retentionByNode.keys(), ...claimsByNode.keys()]);

  const masteryByNode = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const nodeSightings = sightingsByNode.get(nodeId) ?? [];
    const nodeClaims = claimsByNode.get(nodeId) ?? [];
    const retention = retentionByNode.get(nodeId) ?? 0;
    const claimScore = computeClaimScore(nodeClaims, nowIso);
    const mastery = retention + claimScore * (1 - retention);
    const bounded = Math.max(0, Math.min(1, mastery));
    // Design audit 2026-08-28 (掌握度评估 G1): without this, one passing mention by the AI
    // produced retention 1.0 → mastery 1.0 → "已完成" on a concept the learner was never asked
    // a single question about. Exposure alone can reach "dim" (the concept is on the map and
    // recent) but never "lit"; only an observed retrieval lifts the ceiling.
    masteryByNode.set(
      nodeId,
      hasRetrievalEvidence(nodeSightings, nodeClaims) ? bounded : Math.min(bounded, DIM_THRESHOLD),
    );
  }
  return masteryByNode;
}

function groupSightingsByNode(
  sightings: readonly NodeSightingRow[],
): Map<string, NodeSightingRow[]> {
  const byNode = new Map<string, NodeSightingRow[]>();
  for (const sighting of sightings) {
    const forNode = byNode.get(sighting.node_id) ?? [];
    forNode.push(sighting);
    byNode.set(sighting.node_id, forNode);
  }
  return byNode;
}

function groupClaimsByNode(claims: readonly MasteryClaimRow[]): Map<string, MasteryClaimRow[]> {
  const byNode = new Map<string, MasteryClaimRow[]>();
  for (const claim of claims) {
    const forNode = byNode.get(claim.node_id) ?? [];
    forNode.push(claim);
    byNode.set(claim.node_id, forNode);
  }
  return byNode;
}

/** The strongest still-relevant claim wins; multiple stale claims don't stack indefinitely.
 * Exported so other consumers (e.g. the three-layer trend series in layers.ts) reuse the
 * exact same decay formula instead of reimplementing it. */
export function computeClaimScore(claims: readonly MasteryClaimRow[], nowIso: string): number {
  const now = Date.parse(nowIso);
  let best = 0;
  for (const claim of claims) {
    const ageDays = Math.max(0, (now - Date.parse(claim.created_at)) / (1000 * 60 * 60 * 24));
    const decay = 0.5 ** (ageDays / CLAIM_HALF_LIFE_DAYS);
    const score = CLAIM_WEIGHT[claim.level] * decay;
    if (score > best) best = score;
  }
  return best;
}
