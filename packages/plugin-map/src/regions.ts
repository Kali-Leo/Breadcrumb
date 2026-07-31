/**
 * Purpose: divide an island's land cells among its kingdoms — deterministic
 * weighted-nearest-seed partition plus chained, lightly smoothed frontier polylines.
 * Main exports: partitionKingdoms, KingdomPartition, KingdomTerritory.
 */
import { averagePoint, chaikinSmooth, chainEdges, type Edge, undirectedEdgeKey } from "./geometry";
import { createSeededRandom } from "./random";
import type { IslandTerrain } from "./terrain";
import type { WorldPoint } from "./types";

export interface KingdomTerritory {
  cellIndices: number[];
  labelPosition: WorldPoint;
}

export interface KingdomPartition {
  /** Same order as the input weights. */
  territories: KingdomTerritory[];
  /** Frontier polylines between different kingdoms, drawn once per island. */
  borderPaths: WorldPoint[][];
}

function angularDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % (2 * Math.PI);
  return difference > Math.PI ? 2 * Math.PI - difference : difference;
}

/** One seed cell per kingdom, spread around the island by cumulative-weight angle. */
function chooseSeedCells(
  terrain: IslandTerrain,
  weights: readonly number[],
  rotation: number,
): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(weight, 1), 0);
  const taken = new Set<number>();
  const seedCells: number[] = [];
  let cumulative = 0;
  for (const rawWeight of weights) {
    const weight = Math.max(rawWeight, 1);
    const targetAngle = rotation + ((cumulative + weight / 2) / totalWeight) * 2 * Math.PI;
    cumulative += weight;
    let bestCell = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const cellIndex of terrain.landCellIndices) {
      if (taken.has(cellIndex)) continue;
      const cell = terrain.cells[cellIndex];
      if (cell === undefined) continue;
      const score = angularDistance(Math.atan2(cell.site.y, cell.site.x), targetAngle);
      if (score < bestScore) {
        bestScore = score;
        bestCell = cellIndex;
      }
    }
    if (bestCell >= 0) taken.add(bestCell);
    seedCells.push(bestCell);
  }
  return seedCells;
}

function collectBorderEdges(
  terrain: IslandTerrain,
  assignmentByCell: ReadonlyMap<number, number>,
): Edge[] {
  const cellsByEdge = new Map<string, { edge: Edge; cellIndices: number[] }>();
  for (const cellIndex of terrain.landCellIndices) {
    const polygon = terrain.cells[cellIndex]?.polygon ?? [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (a === undefined || b === undefined) continue;
      const key = undirectedEdgeKey(a, b);
      const entry = cellsByEdge.get(key) ?? { edge: { a, b }, cellIndices: [] };
      entry.cellIndices.push(cellIndex);
      cellsByEdge.set(key, entry);
    }
  }
  return [...cellsByEdge.values()]
    .filter((entry) => {
      const [first, second] = entry.cellIndices;
      if (first === undefined || second === undefined || entry.cellIndices.length !== 2) {
        return false;
      }
      return assignmentByCell.get(first) !== assignmentByCell.get(second);
    })
    .map((entry) => entry.edge);
}

export function partitionKingdoms(
  terrain: IslandTerrain,
  weights: readonly number[],
  seed: number,
): KingdomPartition {
  const random = createSeededRandom(seed ^ 0x9e3779b9);
  const seedCells = chooseSeedCells(terrain, weights, random() * 2 * Math.PI);

  const assignmentByCell = new Map<number, number>();
  for (const cellIndex of terrain.landCellIndices) {
    const cell = terrain.cells[cellIndex];
    if (cell === undefined) continue;
    let bestKingdom = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    weights.forEach((weight, kingdomIndex) => {
      const seedCell = terrain.cells[seedCells[kingdomIndex] ?? -1];
      if (seedCell === undefined) return;
      // Linear weighting so a branch's territory visibly tracks its knowledge share.
      const distance = Math.hypot(cell.site.x - seedCell.site.x, cell.site.y - seedCell.site.y);
      const score = distance / Math.max(weight, 1);
      if (score < bestScore) {
        bestScore = score;
        bestKingdom = kingdomIndex;
      }
    });
    assignmentByCell.set(cellIndex, bestKingdom);
  }

  const territories: KingdomTerritory[] = weights.map((_, kingdomIndex) => {
    const cellIndices = terrain.landCellIndices.filter(
      (cellIndex) => assignmentByCell.get(cellIndex) === kingdomIndex,
    );
    const sites = cellIndices
      .map((cellIndex) => terrain.cells[cellIndex]?.site)
      .filter((site): site is WorldPoint => site !== undefined);
    return { cellIndices, labelPosition: averagePoint(sites) };
  });

  const borderPaths = chainEdges(collectBorderEdges(terrain, assignmentByCell)).map((chain) =>
    chaikinSmooth(chain.points, 1, chain.closed),
  );

  return { territories, borderPaths };
}
