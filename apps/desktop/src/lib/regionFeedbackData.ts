/**
 * Purpose: raw source rows behind the map's region hover panel — sightings, mastery claims
 * and the productive-use footprint, fetched once per map visit so hovering a region only
 * filters in memory (the scoped series functions live in @breadcrumb/plugin-feedback).
 * Main exports: RegionFeedbackSources, loadRegionFeedbackSources.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { getRepos } from "./db";
import { buildProductiveUseTimesByNode } from "./productiveUseTimes";

export interface RegionFeedbackSources {
  sightings: NodeSightingRow[];
  claims: MasteryClaimRow[];
  productiveUseTimesByNode: ReadonlyMap<string, readonly string[]>;
}

/** One fetch covering everything the region panel needs; the caller keeps the result for
 * the lifetime of the map page and hands it to every hover. */
export async function loadRegionFeedbackSources(): Promise<RegionFeedbackSources> {
  const repos = await getRepos();
  const [sightings, claims] = await Promise.all([
    repos.nodeSightings.listAll(),
    repos.masteryClaims.listAll(),
  ]);
  const productiveUseTimesByNode = await buildProductiveUseTimesByNode(repos, sightings);
  return { sightings, claims, productiveUseTimesByNode };
}
