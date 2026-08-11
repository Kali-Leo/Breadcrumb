/**
 * Purpose: shapes and places the unnamed islets — flat roots that carry no subtree and
 * gathered with nobody — as tiny nameless landmasses scattered in the open sea.
 * Main exports: buildIslets, ISLET_RADIUS.
 */
import { createSeededRandom, hashStringToSeed } from "./random";
import { findOpenSeaPoint, type SeaBox, type SeaObstacle } from "./seaPlacement";
import { buildLandCells, terrainFor, translatePath } from "./terrainParts";
import type { TopicSummary } from "./topics";
import type { IslandModel, IsletModel, WorldPoint } from "./types";

/** Every islet is the same small size — an islet's meaning is "on its own", not "how much". */
export const ISLET_RADIUS = 90;
const ISLET_SIZE_TIER = 1;
/** Keep clear of a continent's hit radius (1.35 r) plus a visible strip of sea. */
const ISLAND_CLEARANCE_FACTOR = 1.35;
const ISLAND_CLEARANCE_PADDING = 140;
const ISLET_MUTUAL_CLEARANCE = 240;
const BOX_EXPANSION = 200;
const EMPTY_SEA_HALF_SIZE = 200;
const PLACEMENT_ATTEMPTS = 80;
const FALLBACK_RING_PADDING = 320;
const GOLDEN_ANGLE = 2.399963229728653;

function continentBox(islands: readonly IslandModel[]): SeaBox {
  if (islands.length === 0) {
    const half = EMPTY_SEA_HALF_SIZE + BOX_EXPANSION;
    return { minX: -half, minY: -half, maxX: half, maxY: half };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const island of islands) {
    minX = Math.min(minX, island.center.x - island.radius);
    minY = Math.min(minY, island.center.y - island.radius);
    maxX = Math.max(maxX, island.center.x + island.radius);
    maxY = Math.max(maxY, island.center.y + island.radius);
  }
  return {
    minX: minX - BOX_EXPANSION,
    minY: minY - BOX_EXPANSION,
    maxX: maxX + BOX_EXPANSION,
    maxY: maxY + BOX_EXPANSION,
  };
}

/** The crowded-sea escape hatch: a golden-angle ring outside every continent, so an islet
 * is always placed somewhere rather than dropped. */
function fallbackRingPoint(islands: readonly IslandModel[], isletIndex: number): WorldPoint {
  const furthest = islands.reduce(
    (max, island) => Math.max(max, Math.hypot(island.center.x, island.center.y) + island.radius),
    0,
  );
  const ringRadius = furthest + FALLBACK_RING_PADDING;
  const angle = isletIndex * GOLDEN_ANGLE;
  return { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius };
}

function isletObstacles(
  islands: readonly IslandModel[],
  placedCenters: readonly WorldPoint[],
): SeaObstacle[] {
  return [
    ...islands.map((island) => ({
      center: island.center,
      clearance: island.radius * ISLAND_CLEARANCE_FACTOR + ISLAND_CLEARANCE_PADDING,
    })),
    ...placedCenters.map((center) => ({ center, clearance: ISLET_MUTUAL_CLEARANCE })),
  ];
}

/**
 * Positions depend only on the set of islet ids (sorted) and the continents around them,
 * so the same knowledge always draws the same sea.
 */
export function buildIslets(
  summaries: readonly TopicSummary[],
  islands: readonly IslandModel[],
): IsletModel[] {
  if (summaries.length === 0) return [];
  const random = createSeededRandom(
    hashStringToSeed(
      summaries
        .map((summary) => summary.id)
        .sort()
        .join(","),
    ),
  );
  const box = continentBox(islands);
  const placedCenters: WorldPoint[] = [];

  return summaries.map((summary, isletIndex) => {
    const center =
      findOpenSeaPoint(random, box, isletObstacles(islands, placedCenters), PLACEMENT_ATTEMPTS) ??
      fallbackRingPoint(islands, isletIndex);
    placedCenters.push(center);
    const terrain = terrainFor(summary.id, ISLET_RADIUS, ISLET_SIZE_TIER);
    return {
      nodeId: summary.id,
      label: summary.label,
      center,
      radius: ISLET_RADIUS,
      coastLoops: terrain.coastLoops.map((loop) => translatePath(loop, center)),
      landCells: buildLandCells(terrain, center),
    };
  });
}
