/**
 * Purpose: pure data contracts of the generated world — everything the renderer needs,
 * nothing about how to draw it. All coordinates are absolute world units.
 * Main exports: WorldModel, IslandModel, KingdomModel, VillageModel, KnowledgePointModel.
 */

export interface WorldPoint {
  x: number;
  y: number;
}

export interface KnowledgePointModel {
  nodeId: string;
  label: string;
  position: WorldPoint;
}

export interface VillageModel {
  nodeId: string;
  label: string;
  /** 1 hamlet … 4 town — drives how many house glyphs the settlement gets. */
  tier: 1 | 2 | 3 | 4;
  position: WorldPoint;
  points: KnowledgePointModel[];
  /** Node ids of the village subtree (for fog aggregation). */
  memberNodeIds: string[];
}

export interface KingdomModel {
  nodeId: string;
  label: string;
  /** Voronoi cell polygons owned by this kingdom, for the territory tint. */
  cellPolygons: WorldPoint[][];
  /** Label anchor — centroid of the territory. */
  labelPosition: WorldPoint;
  /** Stable palette index for the territory tint. */
  tintIndex: number;
  villages: VillageModel[];
  /** Node ids of the kingdom subtree (for fog aggregation). */
  memberNodeIds: string[];
}

export interface LandCellModel {
  polygon: WorldPoint[];
  site: WorldPoint;
  /** Height normalized to 0..1 across this island's land — drives relief shading. */
  height01: number;
}

export interface IslandModel {
  nodeId: string;
  label: string;
  center: WorldPoint;
  /** Nominal slot radius of the island (world units). */
  radius: number;
  /** Closed, smoothed coast loops, largest first. */
  coastLoops: WorldPoint[][];
  /** Every land cell with its normalized height (for shading and relief glyphs). */
  landCells: LandCellModel[];
  /** Inner kingdom frontiers, chained into polylines, drawn once per island. */
  kingdomBorderPaths: WorldPoint[][];
  /** Anchors for hill glyphs on high ground. */
  hills: WorldPoint[];
  kingdoms: KingdomModel[];
  /** Node ids of the whole island subtree (for fog aggregation). */
  memberNodeIds: string[];
}

export interface WorldModel {
  islands: IslandModel[];
}
