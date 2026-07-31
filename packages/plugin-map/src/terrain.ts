/**
 * Purpose: terrain orchestrator — blue-noise mesh, Azgaar-sculpted heightmap,
 * mewo2 hydraulic erosion, land mask with smoothed coast loops and flow-accumulation
 * rivers. Island-local coordinates (origin at island center).
 * Main exports: generateTerrain, IslandTerrain, TerrainCell.
 */

import { erodeTerrain } from "./erosion";
import { chainEdges, type Edge, polygonArea, undirectedEdgeKey } from "./geometry";
import { generateHeightmap } from "./heightmap";
import { buildIslandMesh } from "./mesh";
import { smoothCoastLoop } from "./nortantis/coastCurve";
import { createSeededRandom } from "./random";
import { extractRivers, type RiverPath } from "./rivers";
import type { WorldPoint } from "./types";

export interface TerrainCell {
  polygon: WorldPoint[];
  site: WorldPoint;
  /** Eroded height, sea level at 0 (normalized units, land > 0). */
  height: number;
  isLand: boolean;
  /** Downhill slope normalized to 0..1 by the land's 90th percentile. */
  slope01: number;
  /** Flow accumulation normalized to 0..1 by the island maximum. */
  flux01: number;
  /** Direction toward the downhill neighbor (radians; 0 when flat). */
  downhillAngle: number;
}

export interface IslandTerrain {
  cells: TerrainCell[];
  landCellIndices: number[];
  coastLoops: WorldPoint[][];
  rivers: RiverPath[];
}

const CELL_TARGET_BY_TIER = [1600, 2000, 2400, 2800, 3200, 3600] as const;
const LAND_FRACTION_BY_TIER = [0.28, 0.3, 0.33, 0.35, 0.37, 0.39] as const;

/** Edges of land-cell polygons that no other land cell shares — the coastline. */
function collectCoastEdges(
  polygons: readonly WorldPoint[][],
  landIndices: readonly number[],
): Edge[] {
  const seen = new Map<string, { edge: Edge; count: number }>();
  for (const cellIndex of landIndices) {
    const polygon = polygons[cellIndex] ?? [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (a === undefined || b === undefined) continue;
      const key = undirectedEdgeKey(a, b);
      const entry = seen.get(key);
      if (entry === undefined) {
        seen.set(key, { edge: { a, b }, count: 1 });
      } else {
        entry.count += 1;
      }
    }
  }
  return [...seen.values()].filter((entry) => entry.count === 1).map((entry) => entry.edge);
}

function normalizedSlopes(slopes: Float64Array, landIndices: readonly number[]): Float64Array {
  const landSlopes = landIndices.map((index) => slopes[index] ?? 0).sort((a, b) => a - b);
  const percentile90 = landSlopes[Math.floor(landSlopes.length * 0.9)] ?? 1;
  const scale = percentile90 > 0 ? percentile90 : 1;
  const result = new Float64Array(slopes.length);
  for (let index = 0; index < slopes.length; index += 1) {
    result[index] = Math.min(1, (slopes[index] ?? 0) / scale);
  }
  return result;
}

export function generateTerrain(seed: number, radius: number, sizeTier: number): IslandTerrain {
  const tierIndex = Math.min(Math.max(Math.trunc(sizeTier), 1), 6) - 1;
  const random = createSeededRandom(seed);
  const mesh = buildIslandMesh(random, radius, CELL_TARGET_BY_TIER[tierIndex] ?? 2000);
  const sculpted = generateHeightmap(mesh, random, radius, sizeTier);
  const erosion = erodeTerrain(mesh, sculpted, LAND_FRACTION_BY_TIER[tierIndex] ?? 0.33);
  const rivers = extractRivers(mesh, erosion);

  const landCellIndices: number[] = [];
  for (let index = 0; index < mesh.points.length; index += 1) {
    if ((erosion.heights[index] ?? 0) > 0) landCellIndices.push(index);
  }
  const slope01 = normalizedSlopes(erosion.slope, landCellIndices);

  const cells: TerrainCell[] = mesh.points.map((site, index) => {
    const target = erosion.downhill[index] ?? -1;
    const targetPoint = target >= 0 ? mesh.points[target] : undefined;
    return {
      polygon: mesh.cellPolygons[index] ?? [],
      site,
      height: erosion.heights[index] ?? 0,
      isLand: (erosion.heights[index] ?? 0) > 0,
      slope01: slope01[index] ?? 0,
      flux01: erosion.flux01[index] ?? 0,
      downhillAngle:
        targetPoint === undefined ? 0 : Math.atan2(targetPoint.y - site.y, targetPoint.x - site.x),
    };
  });

  const coastLoops = chainEdges(collectCoastEdges(mesh.cellPolygons, landCellIndices))
    .filter((chain) => chain.closed)
    .map((chain) => smoothCoastLoop(chain.points))
    .sort((a, b) => polygonArea(b) - polygonArea(a));

  return { cells, landCellIndices, coastLoops, rivers };
}
