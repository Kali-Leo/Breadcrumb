/**
 * Purpose: place villages on their territory's cell sites (centre-out, kept apart)
 * and scatter knowledge-point anchors in a golden-angle spiral around each village.
 * Main exports: placeVillages, placeVillagePoints.
 */
import { averagePoint } from "./geometry";
import type { SeededRandom } from "./random";
import type { IslandTerrain } from "./terrain";
import type { WorldPoint } from "./types";

const GOLDEN_ANGLE = 2.399963229728653;
/** Minimum distance between two villages of the same kingdom (world units). */
const VILLAGE_SPACING = 26;

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Villages sit on cell sites ordered centre-out, skipping sites that would crowd an
 * earlier village; overflow falls back to a spiral ring around the territory centre.
 * Positions come back in caller order (index-aligned with the villages).
 */
export function placeVillages(
  terrain: IslandTerrain,
  territoryCellIndices: readonly number[],
  villageCount: number,
  random: SeededRandom,
): WorldPoint[] {
  const sites = territoryCellIndices
    .map((cellIndex) => terrain.cells[cellIndex]?.site)
    .filter((site): site is WorldPoint => site !== undefined);
  const centroid = averagePoint(sites);
  const orderedSites = [...sites].sort((a, b) => distance(a, centroid) - distance(b, centroid));

  const positions: WorldPoint[] = [];
  for (const site of orderedSites) {
    if (positions.length >= villageCount) break;
    if (positions.some((placed) => distance(placed, site) < VILLAGE_SPACING)) continue;
    positions.push({
      x: site.x + (random() - 0.5) * 8,
      y: site.y + (random() - 0.5) * 8,
    });
  }
  for (let index = positions.length; index < villageCount; index += 1) {
    const angle = index * GOLDEN_ANGLE + random() * 0.3;
    const ringRadius = VILLAGE_SPACING * (0.8 + 0.35 * Math.sqrt(index + 1));
    positions.push({
      x: centroid.x + Math.cos(angle) * ringRadius,
      y: centroid.y + Math.sin(angle) * ringRadius,
    });
  }
  return positions;
}

/** Knowledge points spiral outward from the village, clear of the house glyphs. */
export function placeVillagePoints(
  villagePosition: WorldPoint,
  pointCount: number,
  villageTier: number,
  random: SeededRandom,
): WorldPoint[] {
  const innerRadius = 9 + villageTier * 2;
  const spread = 12 + villageTier * 5;
  const angleOffset = random() * 2 * Math.PI;
  const positions: WorldPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const angle = angleOffset + index * GOLDEN_ANGLE;
    const radius = innerRadius + spread * Math.sqrt((index + 0.6) / Math.max(pointCount, 1));
    positions.push({
      x: villagePosition.x + Math.cos(angle) * radius,
      y: villagePosition.y + Math.sin(angle) * radius,
    });
  }
  return positions;
}
