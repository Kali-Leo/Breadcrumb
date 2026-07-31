/**
 * Purpose: public entry of the map plugin (headless procedural cartography — UI lives
 * in the desktop app).
 * Main exports: buildWorldModel, world model types, shapeTree, averageRetention.
 */

export { pointInPolygon } from "./geometry";
export { islandRadiusForTier, packIslandCenters, RADIUS_BY_TIER } from "./layout";
export { createSeededRandom, hashStringToSeed, type SeededRandom } from "./random";
export { averageRetention } from "./retention";
export {
  type ShapedIsland,
  type ShapedKingdom,
  type ShapedPoint,
  type ShapedVillage,
  shapeTree,
} from "./treeShape";
export type {
  IslandModel,
  KingdomModel,
  KnowledgePointModel,
  LandCellModel,
  RiverModel,
  VillageModel,
  WorldModel,
  WorldPoint,
} from "./types";
export { buildWorldModel } from "./world";
