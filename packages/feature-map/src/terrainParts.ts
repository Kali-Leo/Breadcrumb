/**
 * Purpose: the island-building parts shared by continents and islets — a memoized terrain
 * generator plus the local-to-world translation of land cells and rivers.
 * Main exports: terrainFor, translate, translatePath, buildLandCells, buildRivers.
 * Side effect: keeps a bounded in-memory terrain cache (deterministic, purely a speedup).
 */
import { hashStringToSeed } from "./random";
import { CANONICAL_RADIUS, generateTerrain, type IslandTerrain, scaleTerrain } from "./terrain";
import type { LandCellModel, RiverModel, WorldPoint } from "./types";

/**
 * Terrain generation is the expensive step and deterministic in the seed alone — memoized
 * per island, so growing a size tier costs a scale pass instead of a whole regeneration
 * (and the island keeps the shape the learner already knows).
 */
const shapeCache = new Map<string, IslandTerrain>();
const scaledCache = new Map<string, IslandTerrain>();
const TERRAIN_CACHE_LIMIT = 96;

function remember<T>(cache: Map<string, T>, key: string, build: () => T): T {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const built = build();
  if (cache.size >= TERRAIN_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, built);
  return built;
}

export function terrainFor(nodeId: string, radius: number): IslandTerrain {
  return remember(scaledCache, `${nodeId}:${radius}`, () => {
    const shape = remember(shapeCache, nodeId, () => generateTerrain(hashStringToSeed(nodeId)));
    return scaleTerrain(shape, radius / CANONICAL_RADIUS);
  });
}

export function translate(point: WorldPoint, offset: WorldPoint): WorldPoint {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

export function translatePath(path: readonly WorldPoint[], offset: WorldPoint): WorldPoint[] {
  return path.map((point) => translate(point, offset));
}

export function buildLandCells(terrain: IslandTerrain, center: WorldPoint): LandCellModel[] {
  const landHeights = terrain.landCellIndices
    .map((cellIndex) => terrain.cells[cellIndex]?.height)
    .filter((height): height is number => height !== undefined);
  const minHeight = Math.min(...landHeights);
  const maxHeight = Math.max(...landHeights);
  const heightRange = Math.max(maxHeight - minHeight, 1e-6);
  return terrain.landCellIndices.flatMap((cellIndex) => {
    const cell = terrain.cells[cellIndex];
    if (cell === undefined) return [];
    return [
      {
        polygon: translatePath(cell.polygon, center),
        site: translate(cell.site, center),
        height01: (cell.height - minHeight) / heightRange,
        slope01: cell.slope01,
        flux01: cell.flux01,
        downhillAngle: cell.downhillAngle,
      },
    ];
  });
}

export function buildRivers(terrain: IslandTerrain, center: WorldPoint): RiverModel[] {
  return terrain.rivers.map((river) => ({
    points: translatePath(river.points, center),
    startWidth: river.startWidth,
    endWidth: river.endWidth,
  }));
}
