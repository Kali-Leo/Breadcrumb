/**
 * Purpose: tectonic-plate land mask for one island — grows plates over the cell graph,
 * assigns continental/oceanic types, simulates collisions and returns a 0..1 land
 * multiplier per cell. Ported from Nortantis (AGPL-3.0) src/nortantis/WorldGraph.java.
 * Main exports: plateLandMask.
 */
import type { IslandMesh } from "../mesh";
import type { SeededRandom } from "../random";
import {
  CONTINENTAL_PLATE_LEVEL,
  computePlateElevations,
  OCEAN_PLATE_LEVEL,
  type PlateDescriptor,
} from "./plateElevation";
import { growTectonicPlates } from "./plateGrowth";

// --- tuning constants ---
/**
 * Probability that a non-border plate is continental, per size tier 1..6. Nortantis
 * calls this centerLandToWaterProbability (its generator draws 0.75..1 for island-like
 * maps); lower tiers get less land-capable area so island size tracks the tier.
 */
export const CONTINENTAL_PROBABILITY_BY_TIER = [0.5, 0.58, 0.66, 0.74, 0.82, 0.9] as const;
/**
 * Nortantis edgeLandToWaterProbability. 0 keeps every plate touching the mesh border
 * oceanic — a lone island must be surrounded by open sea.
 */
export const BORDER_CONTINENTAL_PROBABILITY = 0;
/**
 * ADAPTATION: Nortantis maps end at a rectangular border whose plates are oceanic; an
 * island is round and its Voronoi bound corners lie far outside the coast budget. Cells
 * beyond END (fraction of mesh.bound) are forced to sea, with a soft band from START.
 */
export const OCEAN_CAP_START_FRACTION = 0.72;
export const OCEAN_CAP_END_FRACTION = 0.85;

function centroidOfPlate(mesh: IslandMesh, plateOf: Int32Array, plateId: number) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let cell = 0; cell < mesh.points.length; cell += 1) {
    if (plateOf[cell] !== plateId) continue;
    const site = mesh.points[cell];
    if (site === undefined) continue;
    sumX += site.x;
    sumY += site.y;
    count += 1;
  }
  return { x: sumX / Math.max(1, count), y: sumY / Math.max(1, count) };
}

/**
 * Returns a 0..1 multiplier per cell (1 = continental interior, 0 = open ocean).
 * Deterministic given the rng stream. Boundary cells always end at exactly 0.
 */
export function plateLandMask(
  mesh: IslandMesh,
  random: SeededRandom,
  sizeTier: number,
): Float64Array {
  const tierIndex = Math.min(Math.max(Math.trunc(sizeTier), 1), 6) - 1;
  const continentalProbability = CONTINENTAL_PROBABILITY_BY_TIER[tierIndex] ?? 0.69;

  const { plateOf, plateIds } = growTectonicPlates(mesh, random);

  // Port of createTectonicPlates' tail: velocities are drawn before plate types.
  const plates = new Map<number, PlateDescriptor>();
  for (const plateId of plateIds) {
    plates.set(plateId, {
      continental: false,
      velocity: { angle: random() * 2 * Math.PI, radius: random() },
      centroid: centroidOfPlate(mesh, plateOf, plateId),
    });
  }

  // Port of assignOceanAndContinentalPlates.
  for (const plateId of plateIds) {
    const plate = plates.get(plateId);
    if (plate !== undefined) plate.continental = !(random() > continentalProbability);
  }
  // Border plates become oceanic (BORDER_CONTINENTAL_PROBABILITY = 0).
  // ADAPTATION: Nortantis checks corner.isBorder against its rectangular map edge. The
  // handful of island plates all touch the rectangular mesh bound, so that test would
  // sink every plate; the island's true "map edge" is the ocean-cap circle instead — a
  // plate whose centroid sits beyond the cap start counts as a border plate.
  const borderPlates = new Set<number>();
  for (const plateId of plateIds) {
    const centroid = plates.get(plateId)?.centroid;
    if (centroid === undefined) continue;
    if (Math.hypot(centroid.x, centroid.y) > mesh.bound * OCEAN_CAP_START_FRACTION) {
      borderPlates.add(plateId);
    }
  }
  for (const plateId of plateIds) {
    if (!borderPlates.has(plateId)) continue;
    const plate = plates.get(plateId);
    if (plate !== undefined) plate.continental = random() < BORDER_CONTINENTAL_PROBABILITY;
  }

  // ADAPTATION: a whole Nortantis map survives an all-oceanic roll; a single island
  // cannot. Guarantee land by forcing the plate under the island center continental.
  const hasContinental = [...plates.values()].some((plate) => plate.continental);
  if (!hasContinental) {
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let cell = 0; cell < mesh.points.length; cell += 1) {
      if (borderPlates.has(plateOf[cell] ?? 0)) continue;
      const site = mesh.points[cell];
      if (site === undefined) continue;
      const distance = Math.hypot(site.x, site.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = cell;
      }
    }
    const plate = nearest >= 0 ? plates.get(plateOf[nearest] ?? 0) : undefined;
    if (plate !== undefined) plate.continental = true;
  }

  const elevations = computePlateElevations(mesh, plateOf, plateIds, plates);

  // Elevation → multiplier: oceanic base level maps to 0, continental base to 1, the
  // smoothed collision zones in between grade the coastline organically.
  const mask = new Float64Array(mesh.points.length);
  const capStart = mesh.bound * OCEAN_CAP_START_FRACTION;
  const capEnd = mesh.bound * OCEAN_CAP_END_FRACTION;
  for (let cell = 0; cell < mesh.points.length; cell += 1) {
    const site = mesh.points[cell];
    if (site === undefined || mesh.boundaryCells[cell] === true) continue;
    const normalized =
      ((elevations[cell] ?? 0) - OCEAN_PLATE_LEVEL) / (CONTINENTAL_PLATE_LEVEL - OCEAN_PLATE_LEVEL);
    const distance = Math.hypot(site.x, site.y);
    const capFalloff =
      distance >= capEnd ? 0 : Math.min(1, (capEnd - distance) / (capEnd - capStart));
    mask[cell] = Math.min(1, Math.max(0, normalized)) * capFalloff;
  }
  return mask;
}
