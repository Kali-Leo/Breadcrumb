/**
 * Purpose: plate elevation simulation — oceanic/continental base levels, collision
 * ridges and subduction trenches along plate boundaries, then inward smoothing.
 * Ported from Nortantis (AGPL-3.0) src/nortantis/WorldGraph.java (lowerOceanPlates,
 * assignPlateCornerElevations), adapted from Voronoi corners to our cell graph.
 */
import type { IslandMesh } from "../mesh";
import type { WorldPoint } from "../types";
import { calcLevelOfConvergence, type PlateVelocity } from "./plateMotion";

/** WorldGraph.oceanPlateLevel. */
export const OCEAN_PLATE_LEVEL = 0.2;
/** WorldGraph.continentalPlateLevel. */
export const CONTINENTAL_PLATE_LEVEL = 0.45;
/** WorldGraph.collisionScale. */
const COLLISION_SCALE = 0.4;

export interface PlateDescriptor {
  continental: boolean;
  velocity: PlateVelocity;
  centroid: WorldPoint;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Port of lowerOceanPlates, corners→cells: a corner blended by the oceanic ratio of the
 * centers touching it becomes a cell blended by the ratio over itself plus neighbours.
 */
function baseElevations(
  mesh: IslandMesh,
  plateOf: Int32Array,
  plates: ReadonlyMap<number, PlateDescriptor>,
): Float64Array {
  const elevations = new Float64Array(mesh.points.length);
  for (let cell = 0; cell < mesh.points.length; cell += 1) {
    const cluster = [cell, ...(mesh.neighbors[cell] ?? [])];
    let oceanic = 0;
    for (const member of cluster) {
      if (plates.get(plateOf[member] ?? 0)?.continental !== true) oceanic += 1;
    }
    const oceanicRatio = oceanic / cluster.length;
    elevations[cell] =
      oceanicRatio * OCEAN_PLATE_LEVEL + (1 - oceanicRatio) * CONTINENTAL_PLATE_LEVEL;
  }
  return elevations;
}

/**
 * Port of the collision half of assignPlateCornerElevations. Each cross-plate neighbour
 * pair is one Voronoi edge: converging plates raise both cells (ridges), and an oceanic
 * plate subducting under a continental one digs a trench on the oceanic side.
 * ADAPTATION: Java raises the edge's two corners; we raise the two adjacent cells.
 * Java lowers the oceanic center's non-boundary corners; we lower the oceanic cell's
 * same-plate neighbours that sit entirely inside their plate.
 */
function applyCollisions(
  mesh: IslandMesh,
  plateOf: Int32Array,
  plates: ReadonlyMap<number, PlateDescriptor>,
  elevations: Float64Array,
  touched: boolean[],
): void {
  const isInterior = (cell: number): boolean =>
    (mesh.neighbors[cell] ?? []).every((neighbor) => plateOf[neighbor] === plateOf[cell]);

  for (let cell = 0; cell < mesh.points.length; cell += 1) {
    for (const neighbor of mesh.neighbors[cell] ?? []) {
      if (neighbor <= cell) continue; // each unordered pair once, like each Java edge
      const plateA = plates.get(plateOf[cell] ?? 0);
      const plateB = plates.get(plateOf[neighbor] ?? 0);
      if (plateA === undefined || plateB === undefined || plateA === plateB) continue;

      let convergeLevel = calcLevelOfConvergence(
        plateA.centroid,
        plateA.velocity,
        plateB.centroid,
        plateB.velocity,
      );
      // Converging plates get roughed up per polygon to break long snake islands.
      if (convergeLevel > 0) {
        const siteA = mesh.points[cell];
        const siteB = mesh.points[neighbor];
        if (siteA !== undefined && siteB !== undefined) {
          convergeLevel = calcLevelOfConvergence(siteA, plateA.velocity, siteB, plateB.velocity);
        }
      }

      elevations[cell] = clamp01((elevations[cell] ?? 0) + convergeLevel * COLLISION_SCALE);
      elevations[neighbor] = clamp01((elevations[neighbor] ?? 0) + convergeLevel * COLLISION_SCALE);
      touched[cell] = true;
      touched[neighbor] = true;

      // Subduction of an ocean plate under a continental one.
      if (convergeLevel > 0 && plateA.continental !== plateB.continental) {
        const oceanicCell = plateA.continental ? neighbor : cell;
        for (const inner of mesh.neighbors[oceanicCell] ?? []) {
          if (plateOf[inner] !== plateOf[oceanicCell] || !isInterior(inner)) continue;
          elevations[inner] = clamp01((elevations[inner] ?? 0) - convergeLevel * COLLISION_SCALE);
          touched[inner] = true;
        }
      }
    }
  }
}

/**
 * Port of the boundary-inward averaging search in assignPlateCornerElevations: per
 * plate, start from collision-touched cells and expand; each newly explored cell takes
 * the average of itself and its already-explored neighbours.
 */
function smoothInward(
  mesh: IslandMesh,
  plateOf: Int32Array,
  plateIds: readonly number[],
  elevations: Float64Array,
  touched: readonly boolean[],
): void {
  for (const plateId of plateIds) {
    const explored: number[] = [];
    const isExplored = new Uint8Array(mesh.points.length);
    for (let cell = 0; cell < mesh.points.length; cell += 1) {
      if (plateOf[cell] === plateId && touched[cell] === true) {
        explored.push(cell);
        isExplored[cell] = 1;
      }
    }
    let cellFound = true;
    while (cellFound) {
      cellFound = false;
      const foundThisIteration: number[] = [];
      for (const exploredCell of explored) {
        for (const cell of mesh.neighbors[exploredCell] ?? []) {
          if (isExplored[cell] === 1 || plateOf[cell] !== plateId) continue;
          let sum = elevations[cell] ?? 0;
          let count = 1;
          for (const adjacent of mesh.neighbors[cell] ?? []) {
            if (isExplored[adjacent] === 1) {
              sum += elevations[adjacent] ?? 0;
              count += 1;
            }
          }
          elevations[cell] = sum / count;
          isExplored[cell] = 1;
          foundThisIteration.push(cell);
          cellFound = true;
        }
      }
      explored.push(...foundThisIteration);
    }
  }
}

/** Full corner-elevation pipeline, adapted to cells: base levels, collisions, smoothing. */
export function computePlateElevations(
  mesh: IslandMesh,
  plateOf: Int32Array,
  plateIds: readonly number[],
  plates: ReadonlyMap<number, PlateDescriptor>,
): Float64Array {
  const elevations = baseElevations(mesh, plateOf, plates);
  const touched = new Array<boolean>(mesh.points.length).fill(false);
  applyCollisions(mesh, plateOf, plates, elevations, touched);
  smoothInward(mesh, plateOf, plateIds, elevations, touched);
  return elevations;
}
