/**
 * Purpose: public entry of the map plugin (headless procedural cartography — UI lives
 * in the desktop app).
 * Main exports: buildWorldModel, world model types, shapeTree, averageRetention.
 */
export { islandRadiusForTier, islandSlotCenter, RADIUS_BY_TIER, SLOT_SPACING } from "./layout";
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
  VillageModel,
  WorldModel,
  WorldPoint,
} from "./types";
export { buildWorldModel } from "./world";
