/**
 * Purpose: the mastery estimate — FSRS retention (real footprints) as the base, topped up
 * by self-report claims that decay if never revisited. Self-report can never outweigh real
 * evidence; it only fills the gap real evidence hasn't covered yet.
 * Main exports: computeMastery, LIT_THRESHOLD, DIM_THRESHOLD, masteryTier, MasteryTier,
 * CLAIM_WEIGHT, CLAIM_HALF_LIFE_DAYS.
 */
import type { MasteryClaimLevel, MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
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

/** Mastery (0..1) per node that has at least one sighting or claim. Nodes with neither are
 * absent from the map (callers treat a missing entry as 0, i.e. "unlit"). */
export function computeMastery(
  sightings: readonly NodeSightingRow[],
  claims: readonly MasteryClaimRow[],
  nowIso: string,
): Map<string, number> {
  const retentionByNode = computeRetentionByNode(sightings, nowIso);
  const claimsByNode = groupClaimsByNode(claims);
  const nodeIds = new Set([...retentionByNode.keys(), ...claimsByNode.keys()]);

  const masteryByNode = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const retention = retentionByNode.get(nodeId) ?? 0;
    const claimScore = computeClaimScore(claimsByNode.get(nodeId) ?? [], nowIso);
    const mastery = retention + claimScore * (1 - retention);
    masteryByNode.set(nodeId, Math.max(0, Math.min(1, mastery)));
  }
  return masteryByNode;
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

/** The strongest still-relevant claim wins; multiple stale claims don't stack indefinitely. */
function computeClaimScore(claims: readonly MasteryClaimRow[], nowIso: string): number {
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
