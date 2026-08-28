/**
 * Purpose: the three-layer knowledge estimate (spec 035 T7a, Leo's decision) — memory /
 * understanding / intuition, each summed across every sighted node's FSRS checkpoints
 * (retention.ts semantics) and sampled at many instants, all decaying with forgetting.
 * Main exports: KnowledgeLayerPoint, INTUITION_STABILITY_THRESHOLD_DAYS,
 * computeKnowledgeLayerSeries.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { fsrs } from "ts-fsrs";
import { computeClaimScore } from "./mastery";
import { buildNodeCheckpoints, gradedSightingsOf } from "./retention";

// Same explicit configuration as retention.ts's scheduler — the two must stay identical, since
// this file samples the retrievability of cards that file's semantics produced. See the comment
// there for why enable_short_term is stated rather than inherited (design audit 2026-08-28 #7).
const scheduler = fsrs({ enable_short_term: false });

/** memory(t) = Σ retrievability; understanding(t) = Σ claimScore × retrievability;
 * intuition(t) = Σ retrievability over nodes whose stability has cleared the automation
 * threshold and that have at least one recorded productive use. All three are explicit
 * estimates (never claimed as ground truth), and all three decay as retrievability decays. */
export interface KnowledgeLayerPoint {
  memory: number;
  understanding: number;
  intuition: number;
}

/** A node's checkpoint stability must clear this many days before it can count toward
 * "intuition" — a rough proxy for Fitts & Posner's (1967) third, "autonomous" stage of skill
 * acquisition: long-term stability alone is not automaticity, so a recorded productive use
 * (the learner producing the concept unprompted) is also required. */
export const INTUITION_STABILITY_THRESHOLD_DAYS = 30;

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

/** Sum of `memory` / `understanding` / `intuition` across every sighted node, at each of
 * `sampleInstantsIso`. Mirrors the old computeRetentionSumSeries's per-node checkpoint-pointer
 * walk — each node's checkpoint (and productive-use) pointer advances forward across samples
 * in time order, so the whole function is O((sightings + samples) log samples) per node, not
 * O(sightings × samples). A node with claims but no sightings has no checkpoint and
 * contributes 0 to every layer, matching R_n(t) = 0 for it. */
export function computeKnowledgeLayerSeries(input: {
  sightings: readonly NodeSightingRow[];
  claims: readonly MasteryClaimRow[];
  /** User-authored message instants that touched each node — the productive-use footprint
   * "intuition" checks for, keyed by node id. */
  productiveUseTimesByNode: ReadonlyMap<string, readonly string[]>;
  sampleInstantsIso: readonly string[];
}): KnowledgeLayerPoint[] {
  const { sightings, claims, productiveUseTimesByNode, sampleInstantsIso } = input;
  if (sampleInstantsIso.length === 0) return [];

  const sightingsByNode = groupSightingsByNode(sightings);
  const claimsByNode = groupClaimsByNode(claims);

  const samplesAscending = sampleInstantsIso
    .map((iso, index) => ({ iso, ms: Date.parse(iso), index }))
    .sort((a, b) => a.ms - b.ms);

  const memory = new Array<number>(sampleInstantsIso.length).fill(0);
  const understanding = new Array<number>(sampleInstantsIso.length).fill(0);
  const intuition = new Array<number>(sampleInstantsIso.length).fill(0);

  for (const [nodeId, nodeSightings] of sightingsByNode) {
    const checkpoints = buildNodeCheckpoints(gradedSightingsOf(nodeSightings));
    const nodeClaims = claimsByNode.get(nodeId) ?? [];
    const productiveMsAscending = [...(productiveUseTimesByNode.get(nodeId) ?? [])]
      .map((iso) => Date.parse(iso))
      .sort((a, b) => a - b);

    let checkpointIndex = -1;
    let productiveIndex = -1;
    for (const sample of samplesAscending) {
      let nextCheckpoint = checkpoints[checkpointIndex + 1];
      while (nextCheckpoint !== undefined && nextCheckpoint.ms <= sample.ms) {
        checkpointIndex += 1;
        nextCheckpoint = checkpoints[checkpointIndex + 1];
      }
      const checkpoint = checkpoints[checkpointIndex];
      if (checkpoint === undefined) continue;

      const retrievability = Math.max(
        0,
        Math.min(1, scheduler.get_retrievability(checkpoint.card, new Date(sample.ms), false)),
      );
      memory[sample.index] = (memory[sample.index] ?? 0) + retrievability;

      const claimsSoFar = nodeClaims.filter((claim) => Date.parse(claim.created_at) <= sample.ms);
      const claimScore = computeClaimScore(claimsSoFar, sample.iso);
      understanding[sample.index] =
        (understanding[sample.index] ?? 0) + claimScore * retrievability;

      let nextProductiveMs = productiveMsAscending[productiveIndex + 1];
      while (nextProductiveMs !== undefined && nextProductiveMs <= sample.ms) {
        productiveIndex += 1;
        nextProductiveMs = productiveMsAscending[productiveIndex + 1];
      }
      const hasProductiveUse = productiveIndex >= 0;
      if (checkpoint.card.stability >= INTUITION_STABILITY_THRESHOLD_DAYS && hasProductiveUse) {
        intuition[sample.index] = (intuition[sample.index] ?? 0) + retrievability;
      }
    }
  }

  return sampleInstantsIso.map((_, index) => ({
    memory: memory[index] ?? 0,
    understanding: understanding[index] ?? 0,
    intuition: intuition[index] ?? 0,
  }));
}
