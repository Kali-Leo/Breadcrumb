/**
 * Purpose: per-island terrain — jittered-grid Voronoi cells, radial-falloff-plus-noise
 * height field, land mask and smoothed closed coast loops. Island-local coordinates
 * (origin at island center).
 * Main exports: generateTerrain, IslandTerrain, TerrainCell.
 */
import { Delaunay } from "d3-delaunay";
import { createNoise2D } from "simplex-noise";
import {
  chaikinSmooth,
  chainEdges,
  type Edge,
  polygonArea,
  quantizedPointKey,
  undirectedEdgeKey,
} from "./geometry";
import { createSeededRandom } from "./random";
import type { WorldPoint } from "./types";

export interface TerrainCell {
  polygon: WorldPoint[];
  site: WorldPoint;
  height: number;
  isLand: boolean;
}

export interface IslandTerrain {
  cells: TerrainCell[];
  landCellIndices: number[];
  coastLoops: WorldPoint[][];
}

const GRID_STEPS = 14;
/** Voronoi bounds relative to the island radius — leaves a sea ring around every coast. */
const SEA_MARGIN = 1.35;
const NOISE_AMPLITUDE = 0.42;
const NOISE_FREQUENCY = 1.8;
const LAND_THRESHOLD = 0.22;

function stripClosingDuplicate(polygon: WorldPoint[]): WorldPoint[] {
  const first = polygon.at(0);
  const last = polygon.at(-1);
  if (
    first !== undefined &&
    last !== undefined &&
    polygon.length > 1 &&
    quantizedPointKey(first) === quantizedPointKey(last)
  ) {
    return polygon.slice(0, -1);
  }
  return polygon;
}

/** Edges of land-cell polygons that no other land cell shares — the coastline. */
function collectCoastEdges(cells: readonly TerrainCell[], landIndices: readonly number[]): Edge[] {
  const seen = new Map<string, { edge: Edge; count: number }>();
  for (const cellIndex of landIndices) {
    const cell = cells[cellIndex];
    if (cell === undefined) continue;
    const polygon = cell.polygon;
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

export function generateTerrain(seed: number, radius: number): IslandTerrain {
  const random = createSeededRandom(seed);
  const noise2D = createNoise2D(random);
  const bound = radius * SEA_MARGIN;
  const step = (2 * bound) / GRID_STEPS;

  const sites: [number, number][] = [];
  for (let row = 0; row < GRID_STEPS; row += 1) {
    for (let column = 0; column < GRID_STEPS; column += 1) {
      sites.push([
        -bound + (column + 0.5) * step + (random() - 0.5) * step * 0.8,
        -bound + (row + 0.5) * step + (random() - 0.5) * step * 0.8,
      ]);
    }
  }
  const voronoi = Delaunay.from(sites).voronoi([-bound, -bound, bound, bound]);

  const cells: TerrainCell[] = sites.map((site, index) => {
    const [x, y] = site;
    const distance = Math.hypot(x, y) / radius;
    const falloff = 1 - distance ** 1.7;
    const noise = noise2D((x / radius) * NOISE_FREQUENCY, (y / radius) * NOISE_FREQUENCY);
    const height = falloff + noise * NOISE_AMPLITUDE;
    const rawPolygon = voronoi.cellPolygon(index) ?? [];
    return {
      polygon: stripClosingDuplicate(rawPolygon.map(([px, py]) => ({ x: px, y: py }))),
      site: { x, y },
      height,
      isLand: height > LAND_THRESHOLD,
    };
  });

  const landCellIndices = cells.flatMap((cell, index) => (cell.isLand ? [index] : []));
  const coastLoops = chainEdges(collectCoastEdges(cells, landCellIndices))
    .filter((chain) => chain.closed)
    .map((chain) => chaikinSmooth(chain.points, 2, true))
    .sort((a, b) => polygonArea(b) - polygonArea(a));

  return { cells, landCellIndices, coastLoops };
}
