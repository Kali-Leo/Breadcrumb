/**
 * Purpose: tectonic plate growth — every cell starts as its own plate, then plates
 * stochastically absorb neighbours, biased toward smooth boundaries.
 * Ported from Nortantis (AGPL-3.0) src/nortantis/WorldGraph.java (createTectonicPlates).
 * Main exports: growTectonicPlates, PlateGrowthResult.
 */
import type { IslandMesh } from "../mesh";
import type { SeededRandom } from "../random";

/** Nortantis: higher values make larger plates, but fewer of them. */
const TECTONIC_PLATE_ITERATION_MULTIPLIER = 30;
/** Nortantis: how smooth plate boundaries are (sample size per merge). */
const PLATE_BOUNDARY_SMOOTHNESS = 26;
/** Nortantis: stop when 9 plates remain and one is getting too small. */
const MIN_NINTH_TO_LAST_PLATE_SIZE = 100;

export interface PlateGrowthResult {
  /** Winning plate id per cell (plate ids are seed cell indices). */
  plateOf: Int32Array;
  /** Surviving plate ids, ascending — a deterministic iteration order. */
  plateIds: number[];
}

/**
 * Beta(1, 3) sample by inverse CDF: F(x) = 1 - (1 - x)^3.
 * ADAPTATION: Nortantis samples Apache Commons BetaDistribution(1, 3); the inverse-CDF
 * draw follows the identical distribution using our single SeededRandom stream.
 */
function sampleBetaOneThree(random: SeededRandom): number {
  return 1 - (1 - random()) ** (1 / 3);
}

/** Port of Center.updateNeighborsNotInSamePlateCount — notSame / same (Infinity when isolated). */
function neighborsNotInSamePlateRatio(mesh: IslandMesh, plateOf: Int32Array, cell: number): number {
  let notSame = 0;
  let same = 0;
  for (const neighbor of mesh.neighbors[cell] ?? []) {
    if (plateOf[cell] !== plateOf[neighbor]) notSame += 1;
    else same += 1;
  }
  // Java float division by zero yields Infinity; keep that behavior.
  return same === 0 ? Number.POSITIVE_INFINITY : notSame / same;
}

/**
 * Faithful port of WorldGraph.createTectonicPlates: assign each cell a plate with a
 * Beta(1,3) growth probability, then repeatedly sample PLATE_BOUNDARY_SMOOTHNESS cells,
 * take the one with the smallest nonzero not-in-same-plate ratio, and let its plate
 * absorb a random foreign neighbour with probability equal to the growth probability.
 */
export function growTectonicPlates(mesh: IslandMesh, random: SeededRandom): PlateGrowthResult {
  const cellCount = mesh.points.length;
  const plateOf = new Int32Array(cellCount);
  const growthProbability = new Float64Array(cellCount);
  const plateCellCounts = new Map<number, number>();
  for (let cell = 0; cell < cellCount; cell += 1) {
    plateOf[cell] = cell;
    growthProbability[cell] = sampleBetaOneThree(random);
    plateCellCounts.set(cell, 1);
  }

  const ratio = new Float64Array(cellCount);
  for (let cell = 0; cell < cellCount; cell += 1) {
    ratio[cell] = neighborsNotInSamePlateRatio(mesh, plateOf, cell);
  }
  const refreshRatioAround = (cell: number): void => {
    ratio[cell] = neighborsNotInSamePlateRatio(mesh, plateOf, cell);
    for (const neighbor of mesh.neighbors[cell] ?? []) {
      ratio[neighbor] = neighborsNotInSamePlateRatio(mesh, plateOf, neighbor);
    }
  };

  const iterations = TECTONIC_PLATE_ITERATION_MULTIPLIER * cellCount;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    // Sample cells; keep the one with the least nonzero foreign-neighbour ratio.
    let least = -1;
    for (let sample = 0; sample < PLATE_BOUNDARY_SMOOTHNESS; sample += 1) {
      const candidate = Math.floor(random() * cellCount);
      if ((ratio[candidate] ?? 0) === 0) continue;
      if (least < 0 || (ratio[candidate] ?? 0) < (ratio[least] ?? 0)) least = candidate;
    }
    if (least < 0) continue;

    // Keep the merge with probability equal to the plate's growth probability.
    const plateId = plateOf[least] ?? 0;
    if (random() >= (growthProbability[plateId] ?? 0)) continue;
    const foreignNeighbors = (mesh.neighbors[least] ?? []).filter(
      (neighbor) => plateOf[neighbor] !== plateId,
    );
    const absorbed = foreignNeighbors[Math.floor(random() * foreignNeighbors.length)];
    if (absorbed === undefined) continue;

    const absorbedPlate = plateOf[absorbed] ?? 0;
    plateCellCounts.set(plateId, (plateCellCounts.get(plateId) ?? 0) + 1);
    const remaining = (plateCellCounts.get(absorbedPlate) ?? 0) - 1;
    if (remaining <= 0) plateCellCounts.delete(absorbedPlate);
    else plateCellCounts.set(absorbedPlate, remaining);
    plateOf[absorbed] = plateId;

    refreshRatioAround(least);
    refreshRatioAround(absorbed);

    // Nortantis: stop when only nine plates remain and one is getting too small,
    // preventing maps that are all ocean or only tiny islands.
    if (plateCellCounts.size === 9) {
      let smallest = Number.POSITIVE_INFINITY;
      for (const count of plateCellCounts.values()) smallest = Math.min(smallest, count);
      if (smallest <= MIN_NINTH_TO_LAST_PLATE_SIZE) break;
    }
  }

  const plateIds = [...plateCellCounts.keys()].sort((a, b) => a - b);
  return { plateOf, plateIds };
}
