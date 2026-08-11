/**
 * Purpose: the island-building parts shared by continents and islets — a memoized terrain
 * generator plus the local-to-world translation of land cells and rivers.
 * Main exports: terrainFor, translate, translatePath, buildLandCells, buildRivers.
 * Side effect: keeps a bounded in-memory terrain cache (deterministic, purely a speedup).
 */
import { hashStringToSeed } from "./random";
import { generateTerrain, type IslandTerrain } from "./terrain";
import type { LandCellModel, RiverModel, WorldPoint } from "./types";

/**
 * Terrain generation is the expensive step and deterministic in (seed, radius, tier)
 * — memoized so incremental learning only regenerates islands that changed tier.
 */
const terrainCache = new Map<string, IslandTerrain>();
const TERRAIN_CACHE_LIMIT = 96;

export function terrainFor(nodeId: string, radius: number, sizeTier: number): IslandTerrain {
  const key = `${nodeId}:${radius}:${sizeTier}`;
  const cached = terrainCache.get(key);
  if (cached !== undefined) return cached;
  const terrain = generateTerrain(hashStringToSeed(nodeId), radius, sizeTier);
  if (terrainCache.size >= TERRAIN_CACHE_LIMIT) {
    const oldestKey = terrainCache.keys().next().value;
    if (oldestKey !== undefined) terrainCache.delete(oldestKey);
  }
  terrainCache.set(key, terrain);
  return terrain;
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
