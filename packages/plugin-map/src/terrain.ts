/**
 * Purpose: terrain orchestrator — blue-noise mesh, Azgaar-sculpted heightmap,
 * mewo2 hydraulic erosion, land mask with smoothed coast loops and flow-accumulation
 * rivers. Island-local coordinates (origin at island center).
 *
 * An island's shape is a function of its seed and nothing else (Leo 2026-09-01: "形状稳定,
 * 剩下的不稳定"). Everything is generated at one canonical radius; growing a size tier
 * scales that same outline up instead of redrawing the coast, so an island you have seen
 * before stays recognizable however much it grows or wherever it lands. Position and size
 * carry no such promise.
 * Main exports: generateTerrain, scaleTerrain, CANONICAL_RADIUS, IslandTerrain, TerrainCell.
 */

import { erodeTerrain } from "./erosion";
import { chainEdges, type Edge, polygonArea, undirectedEdgeKey } from "./geometry";
import { generateHeightmap } from "./heightmap";
import { buildIslandMesh } from "./mesh";
import { smoothCoastLoop } from "./nortantis/coastCurve";
import { OCEAN_CAP_END_FRACTION } from "./nortantis/plates";
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

/** The radius every island is generated at, whatever size it is drawn at (the middle of
 * layout.ts's RADIUS_BY_TIER, so the typical island is scaled least). */
export const CANONICAL_RADIUS = 250;
/** Cell count and land fraction of the canonical island — once tier-dependent, which is
 * exactly what made a growing island redraw its coastline. */
const CANONICAL_CELL_TARGET = 2400;
const CANONICAL_LAND_FRACTION = 0.33;
/** Sculpting richness (ridge count, hill count, plate mask) is likewise fixed: it feeds the
 * heightmap, so tying it to size would move the coast again. */
const CANONICAL_SCULPT_TIER = 3;

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

/** One island's shape, in canonical coordinates. Seed in, coastline out — no size, no
 * position, nothing that changes as the learner keeps learning. */
export function generateTerrain(seed: number): IslandTerrain {
  const radius = CANONICAL_RADIUS;
  const sizeTier = CANONICAL_SCULPT_TIER;
  const random = createSeededRandom(seed);
  const mesh = buildIslandMesh(random, radius, CANONICAL_CELL_TARGET);
  const sculpted = generateHeightmap(mesh, random, radius, sizeTier);
  const erosion = erodeTerrain(mesh, sculpted, CANONICAL_LAND_FRACTION);
  // Erosion deposits sediment on the masked-out rim (big continental islands push a lot
  // of material outward) and the quantile sea level then counts those cells as land — the
  // coast ends up tracing the square Voronoi bound. The rim is ocean by construction.
  const capEnd = mesh.bound * OCEAN_CAP_END_FRACTION;
  for (let index = 0; index < erosion.heights.length; index += 1) {
    const site = mesh.points[index];
    if (site === undefined) continue;
    if (mesh.boundaryCells[index] === true || Math.hypot(site.x, site.y) >= capEnd) {
      erosion.heights[index] = 0;
    }
  }
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

function scalePoint(point: WorldPoint, factor: number): WorldPoint {
  return { x: point.x * factor, y: point.y * factor };
}

/** The same island drawn larger or smaller: every coordinate scales, nothing is redrawn.
 * Heights, slopes and flux stay as they are — they are normalized quantities that decide
 * colour and symbol placement, not extents. */
export function scaleTerrain(terrain: IslandTerrain, factor: number): IslandTerrain {
  if (factor === 1) return terrain;
  return {
    cells: terrain.cells.map((cell) => ({
      ...cell,
      polygon: cell.polygon.map((point) => scalePoint(point, factor)),
      site: scalePoint(cell.site, factor),
    })),
    landCellIndices: terrain.landCellIndices,
    coastLoops: terrain.coastLoops.map((loop) => loop.map((point) => scalePoint(point, factor))),
    rivers: terrain.rivers.map((river) => ({
      ...river,
      points: river.points.map((point) => scalePoint(point, factor)),
      startWidth: river.startWidth * factor,
      endWidth: river.endWidth * factor,
    })),
  };
}
