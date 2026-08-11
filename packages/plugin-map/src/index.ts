/**
 * Purpose: public entry of the map plugin (headless procedural cartography — UI lives
 * in the desktop app).
 * Main exports: buildWorldModel, world model types, shapeTree, shapeContinents,
 * deriveContinents, discoverTopics, buildIslets, findOpenSeaPoint, averageRetention.
 */

export {
  buildContinentNamingMessages,
  type ContinentNamingRequest,
  continentNameCacheKey,
  continentNamingSchema,
  isPlainContinentName,
} from "./continentNaming";
export { shapeContinents } from "./continentShape";
export {
  type ContinentAssignment,
  type ContinentKingdom,
  type ContinentSummary,
  deriveContinents,
} from "./continents";
export { pointInPolygon } from "./geometry";
export { buildIslets, ISLET_RADIUS } from "./isletBuild";
export { islandRadiusForTier, packIslandCenters, RADIUS_BY_TIER } from "./layout";
export { createSeededRandom, hashStringToSeed, type SeededRandom } from "./random";
export { averageRetention } from "./retention";
export { findOpenSeaPoint, type SeaBox, type SeaObstacle } from "./seaPlacement";
export { discoverTopics, type TopicAssignment, type TopicSummary } from "./topics";
export {
  type ShapedIsland,
  type ShapedKingdom,
  type ShapedPoint,
  type ShapedVillage,
  shapeTree,
} from "./treeShape";
export type {
  IslandModel,
  IsletModel,
  KingdomModel,
  KnowledgePointModel,
  LandCellModel,
  RiverModel,
  VillageModel,
  WorldModel,
  WorldPoint,
} from "./types";
export { buildWorldModel } from "./world";
