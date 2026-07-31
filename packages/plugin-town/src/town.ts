/**
 * Purpose: public entry — deterministic town generation into renderer-agnostic plain
 * data (patch shapes, ward kinds, building polygons, wall, gates, streets).
 * Main exports: generateTown, TownPlan, TownPatch.
 */
import { Model } from "./building/model";
import { townRandom } from "./utils/townRandom";

export interface TownPoint {
  x: number;
  y: number;
}

export interface TownPatch {
  shape: TownPoint[];
  withinWalls: boolean;
  withinCity: boolean;
  /** Ward class label from the generator (e.g. "Craftsmen", "Market"), null = countryside. */
  wardLabel: string | null;
  buildings: TownPoint[][];
}

export interface TownPlan {
  patches: TownPatch[];
  /** Closed wall polygon, empty when the town is unwalled. */
  wall: TownPoint[];
  gates: TownPoint[];
  /** Wall tower positions (drawn as filled circles in the official renderer). */
  towers: TownPoint[];
  /** Smoothed street/road polylines (arteries). */
  streets: TownPoint[][];
  /** Roads outside the walls — the only paths the official CityMap renderer draws. */
  roads: TownPoint[][];
  /** Radius of the built-up area — lets the renderer frame the scene. */
  cityRadius: number;
}

function toPoints(shape: Iterable<{ x: number; y: number }>): TownPoint[] {
  return [...shape].map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Seeded and deterministic: the same (seed, nPatches) always returns the same town.
 * nPatches guide: 4 hamlet, 8 village, 15 town, 24 walled city.
 */
export function generateTown(seed: number, nPatches: number): TownPlan {
  townRandom.reset(Math.max(1, seed % 2 ** 31));
  const model = new Model(nPatches);
  return {
    patches: model.patches.map((patch) => ({
      shape: toPoints(patch.shape),
      withinWalls: patch.withinWalls,
      withinCity: patch.withinCity,
      wardLabel: patch.ward?.getLabel() ?? null,
      buildings: (patch.ward?.geometry ?? []).map((building) => toPoints(building)),
    })),
    wall: model.wall !== null ? toPoints(model.wall.shape) : [],
    gates: toPoints(model.gates),
    towers: model.wall !== null ? toPoints(model.wall.towers) : [],
    streets: model.arteries.map((street) => toPoints(street)),
    roads: model.roads.map((road) => toPoints(road)),
    cityRadius: model.cityRadius,
  };
}
