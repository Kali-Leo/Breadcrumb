/**
 * Purpose: node-subset variants of the heatmap and layer-trend series for the map's region
 * hover panel — filters the raw rows down to one region's member nodes, then reuses the
 * whole-corpus functions from activity/trends unchanged.
 * Main exports: computeScopedDailyActivity, computeScopedLayerTrendSeries.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { computeDailyActivity, type DailyActivityCell } from "./activity";
import { computeLayerTrendSeries, type LayerTrendPoint } from "./trends";

/** Heatmap cells counting only sightings of nodes inside `nodeIds`. Word guesses and
 * conversation opens carry no node id, so a region heatmap honestly leaves them out. */
export function computeScopedDailyActivity(
  sightings: readonly NodeSightingRow[],
  nodeIds: ReadonlySet<string>,
  options: { days: number; todayIso: string },
): DailyActivityCell[] {
  const eventTimesIso = sightings
    .filter((sighting) => nodeIds.has(sighting.node_id))
    .map((sighting) => sighting.created_at);
  return computeDailyActivity(eventTimesIso, options);
}

/** The three-layer trend restricted to `nodeIds`: sightings, claims and productive-use
 * times of every other node are dropped before the whole-corpus series runs. */
export function computeScopedLayerTrendSeries(input: {
  sightings: readonly NodeSightingRow[];
  claims: readonly MasteryClaimRow[];
  productiveUseTimesByNode: ReadonlyMap<string, readonly string[]>;
  nodeIds: ReadonlySet<string>;
  days: number;
  todayIso: string;
}): LayerTrendPoint[] {
  const scopedProductiveUse = new Map<string, readonly string[]>();
  for (const [nodeId, times] of input.productiveUseTimesByNode) {
    if (input.nodeIds.has(nodeId)) scopedProductiveUse.set(nodeId, times);
  }
  return computeLayerTrendSeries({
    sightings: input.sightings.filter((sighting) => input.nodeIds.has(sighting.node_id)),
    claims: input.claims.filter((claim) => input.nodeIds.has(claim.node_id)),
    productiveUseTimesByNode: scopedProductiveUse,
    days: input.days,
    todayIso: input.todayIso,
  });
}
