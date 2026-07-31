/**
 * Purpose: the island's cell fabric — blue-noise (poisson-disk) sites with one Lloyd
 * relaxation, Voronoi polygons and triangulation adjacency. Island-local coordinates,
 * origin at the island center.
 * Main exports: buildIslandMesh, IslandMesh, SEA_MARGIN.
 */
/// <reference path="./poisson-disk-sampling.d.ts" />
import { Delaunay } from "d3-delaunay";
import PoissonDiskSampling from "poisson-disk-sampling";
import { quantizedPointKey } from "./geometry";
import type { SeededRandom } from "./random";
import type { WorldPoint } from "./types";

/** Voronoi bounds relative to the island radius — leaves a sea ring around any coast. */
export const SEA_MARGIN = 1.35;

export interface IslandMesh {
  /** Cell sites after relaxation. */
  points: WorldPoint[];
  /** Triangulation adjacency per cell. */
  neighbors: number[][];
  /** Clipped Voronoi polygon per cell (closing duplicate stripped). */
  cellPolygons: WorldPoint[][];
  /** Cells that touch the outer bounding box (always ocean). */
  boundaryCells: boolean[];
  /** Approximate distance between neighbouring sites. */
  spacing: number;
  bound: number;
}

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

function polygonCentroidOf(polygon: readonly WorldPoint[]): WorldPoint | null {
  if (polygon.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const point of polygon) {
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / polygon.length, y: sumY / polygon.length };
}

function toDelaunay(points: readonly WorldPoint[], bound: number) {
  const sites: [number, number][] = points.map((point) => [point.x, point.y]);
  const delaunay = Delaunay.from(sites);
  const voronoi = delaunay.voronoi([-bound, -bound, bound, bound]);
  return { delaunay, voronoi };
}

export function buildIslandMesh(
  random: SeededRandom,
  radius: number,
  cellTarget: number,
): IslandMesh {
  const bound = radius * SEA_MARGIN;
  const width = 2 * bound;
  // Poisson packing yields roughly 0.7 points per minDistance² square.
  const minDistance = Math.sqrt((width * width * 0.7) / cellTarget);
  const sampler = new PoissonDiskSampling(
    { shape: [width, width], minDistance, tries: 20 },
    random,
  );
  let points: WorldPoint[] = sampler
    .fill()
    .map(([x, y]) => ({ x: (x ?? 0) - bound, y: (y ?? 0) - bound }));

  // One Lloyd relaxation evens the fabric out without destroying the blue noise.
  const relaxation = toDelaunay(points, bound);
  points = points.map((point, index) => {
    const polygon = relaxation.voronoi.cellPolygon(index);
    if (polygon === null) return point;
    const centroid = polygonCentroidOf(polygon.map(([x, y]) => ({ x, y })));
    return centroid ?? point;
  });

  const { delaunay, voronoi } = toDelaunay(points, bound);
  const neighbors: number[][] = [];
  const cellPolygons: WorldPoint[][] = [];
  const boundaryCells: boolean[] = [];
  const edgeTolerance = 0.01;
  for (let index = 0; index < points.length; index += 1) {
    neighbors.push([...delaunay.neighbors(index)]);
    const rawPolygon = voronoi.cellPolygon(index) ?? [];
    const polygon = stripClosingDuplicate(rawPolygon.map(([x, y]) => ({ x, y })));
    cellPolygons.push(polygon);
    boundaryCells.push(
      polygon.some(
        (point) =>
          Math.abs(Math.abs(point.x) - bound) < edgeTolerance ||
          Math.abs(Math.abs(point.y) - bound) < edgeTolerance,
      ),
    );
  }

  return { points, neighbors, cellPolygons, boundaryCells, spacing: minDistance, bound };
}
