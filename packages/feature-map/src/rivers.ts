/**
 * Purpose: river extraction from the eroded terrain — high-flux land cells traced
 * downhill to the sea, tributaries joining the main stem, paths smoothed and given
 * tapering widths. Follows mewo2/mapgen4 flow-accumulation rivers.
 * Main exports: extractRivers, RiverPath.
 */
import type { ErosionResult } from "./erosion";
import { chaikinSmooth } from "./geometry";
import type { IslandMesh } from "./mesh";
import type { WorldPoint } from "./types";

export interface RiverPath {
  points: WorldPoint[];
  /** Ink width at the spring and at the mouth (world units). */
  startWidth: number;
  endWidth: number;
}

/** Land cells in the top flux share become river cells. */
const RIVER_LAND_SHARE = 0.09;
const MINIMUM_PATH_CELLS = 4;

export function extractRivers(mesh: IslandMesh, erosion: ErosionResult): RiverPath[] {
  const landIndices: number[] = [];
  for (let index = 0; index < erosion.heights.length; index += 1) {
    if ((erosion.heights[index] ?? 0) > 0) landIndices.push(index);
  }
  if (landIndices.length === 0) return [];

  const byFlux = [...landIndices].sort(
    (a, b) => (erosion.flux01[b] ?? 0) - (erosion.flux01[a] ?? 0),
  );
  const riverCellCount = Math.max(8, Math.floor(landIndices.length * RIVER_LAND_SHARE));
  const riverCells = new Set(byFlux.slice(0, riverCellCount));

  // Sources are river cells no other river cell drains into.
  const hasInflow = new Set<number>();
  for (const cell of riverCells) {
    const target = erosion.downhill[cell] ?? -1;
    if (target >= 0 && riverCells.has(target)) hasInflow.add(target);
  }
  const sources = [...riverCells]
    .filter((cell) => !hasInflow.has(cell))
    .sort((a, b) => (erosion.flux01[b] ?? 0) - (erosion.flux01[a] ?? 0));

  const claimed = new Set<number>();
  const rivers: RiverPath[] = [];
  for (const source of sources) {
    if (claimed.has(source)) continue;
    const pathCells: number[] = [];
    let current = source;
    for (let step = 0; step < mesh.points.length; step += 1) {
      pathCells.push(current);
      if (claimed.has(current)) break; // joined an existing river
      claimed.add(current);
      if ((erosion.heights[current] ?? 0) <= 0) break; // reached the sea
      const next = erosion.downhill[current] ?? -1;
      if (next < 0) break;
      current = next;
    }
    if (pathCells.length < MINIMUM_PATH_CELLS) continue;
    const rawPoints = pathCells
      .map((cell) => mesh.points[cell])
      .filter((point): point is WorldPoint => point !== undefined);
    const startFlux = erosion.flux01[pathCells.at(0) ?? -1] ?? 0;
    const endFlux = erosion.flux01[pathCells.at(-1) ?? -1] ?? 0;
    rivers.push({
      points: chaikinSmooth(rawPoints, 2, false),
      startWidth: 0.6 + Math.sqrt(startFlux) * 2.2,
      endWidth: 0.9 + Math.sqrt(endFlux) * 3.4,
    });
  }
  return rivers;
}
