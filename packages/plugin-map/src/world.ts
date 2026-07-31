/**
 * Purpose: pipeline orchestrator — knowledge rows in, fully placed geometric world out.
 * Every island is generated in local coordinates then translated to its fixed slot.
 * Main exports: buildWorldModel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { islandRadiusForTier, packIslandCenters } from "./layout";
import { createSeededRandom, hashStringToSeed } from "./random";
import { partitionKingdoms } from "./regions";
import { placeVillagePoints, placeVillages } from "./settlements";
import { generateTerrain, type IslandTerrain } from "./terrain";
import { type ShapedIsland, type ShapedKingdom, shapeTree } from "./treeShape";
import type {
  IslandModel,
  KingdomModel,
  LandCellModel,
  RiverModel,
  VillageModel,
  WorldModel,
  WorldPoint,
} from "./types";

/**
 * Terrain generation is the expensive step and deterministic in (seed, radius, tier)
 * — memoized so incremental learning only regenerates islands that changed tier.
 */
const terrainCache = new Map<string, IslandTerrain>();
const TERRAIN_CACHE_LIMIT = 96;

function terrainFor(nodeId: string, radius: number, sizeTier: number): IslandTerrain {
  const key = `${nodeId}:${radius}:${sizeTier}`;
  const cached = terrainCache.get(key);
  if (cached !== undefined) return cached;
  const terrain = generateTerrain(hashStringToSeed(nodeId), radius, sizeTier);
  if (terrainCache.size >= TERRAIN_CACHE_LIMIT) {
    const oldestKey = terrainCache.keys().next().value;
    if (oldestKey !== undefined) terrainCache.delete(oldestKey);
  }
  terrainCache.set(key, terrain);
  return terrain;
}

const TINT_PALETTE_SIZE = 4;
const HILL_COUNT_BASE = 3;
/** Hills keep this far from any village so glyphs never overlap (world units). */
const HILL_CLEARANCE = 16;

function translate(point: WorldPoint, offset: WorldPoint): WorldPoint {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function translatePath(path: readonly WorldPoint[], offset: WorldPoint): WorldPoint[] {
  return path.map((point) => translate(point, offset));
}

function buildKingdom(
  shaped: ShapedKingdom,
  kingdomIndex: number,
  terrain: IslandTerrain,
  territoryCellIndices: readonly number[],
  labelPosition: WorldPoint,
  center: WorldPoint,
): KingdomModel {
  const villageRandom = createSeededRandom(hashStringToSeed(shaped.nodeId));
  const villagePositions = placeVillages(
    terrain,
    territoryCellIndices,
    shaped.villages.length,
    villageRandom,
  );
  const villages: VillageModel[] = shaped.villages.map((village, villageIndex) => {
    const localPosition = villagePositions[villageIndex] ?? { x: 0, y: 0 };
    const pointRandom = createSeededRandom(hashStringToSeed(village.nodeId));
    const pointPositions = placeVillagePoints(
      localPosition,
      village.points.length,
      village.tier,
      pointRandom,
    );
    return {
      nodeId: village.nodeId,
      label: village.label,
      tier: village.tier,
      position: translate(localPosition, center),
      points: village.points.map((point, pointIndex) => ({
        nodeId: point.nodeId,
        label: point.label,
        position: translate(pointPositions[pointIndex] ?? localPosition, center),
      })),
      memberNodeIds: village.memberNodeIds,
    };
  });

  return {
    nodeId: shaped.nodeId,
    label: shaped.label,
    cellPolygons: territoryCellIndices
      .map((cellIndex) => terrain.cells[cellIndex]?.polygon ?? [])
      .filter((polygon) => polygon.length > 0)
      .map((polygon) => translatePath(polygon, center)),
    labelPosition: translate(labelPosition, center),
    tintIndex: kingdomIndex % TINT_PALETTE_SIZE,
    villages,
    memberNodeIds: shaped.memberNodeIds,
  };
}

function pickHills(
  terrain: IslandTerrain,
  shaped: ShapedIsland,
  villageLocalPositions: readonly WorldPoint[],
  center: WorldPoint,
): WorldPoint[] {
  return terrain.landCellIndices
    .map((cellIndex) => terrain.cells[cellIndex])
    .filter((cell): cell is NonNullable<typeof cell> => cell !== undefined)
    .sort((a, b) => b.height - a.height)
    .filter((cell) =>
      villageLocalPositions.every(
        (village) => Math.hypot(cell.site.x - village.x, cell.site.y - village.y) > HILL_CLEARANCE,
      ),
    )
    .slice(0, HILL_COUNT_BASE + shaped.sizeTier)
    .map((cell) => translate(cell.site, center));
}

function buildLandCells(terrain: IslandTerrain, center: WorldPoint): LandCellModel[] {
  const landHeights = terrain.landCellIndices
    .map((cellIndex) => terrain.cells[cellIndex]?.height)
    .filter((height): height is number => height !== undefined);
  const minHeight = Math.min(...landHeights);
  const maxHeight = Math.max(...landHeights);
  const heightRange = Math.max(maxHeight - minHeight, 1e-6);
  return terrain.landCellIndices.flatMap((cellIndex) => {
    const cell = terrain.cells[cellIndex];
    if (cell === undefined) return [];
    return [
      {
        polygon: translatePath(cell.polygon, center),
        site: translate(cell.site, center),
        height01: (cell.height - minHeight) / heightRange,
        slope01: cell.slope01,
        flux01: cell.flux01,
        downhillAngle: cell.downhillAngle,
      },
    ];
  });
}

function buildRivers(terrain: IslandTerrain, center: WorldPoint): RiverModel[] {
  return terrain.rivers.map((river) => ({
    points: translatePath(river.points, center),
    startWidth: river.startWidth,
    endWidth: river.endWidth,
  }));
}

function buildIsland(shaped: ShapedIsland, center: WorldPoint): IslandModel {
  const radius = islandRadiusForTier(shaped.sizeTier);
  const terrain = terrainFor(shaped.nodeId, radius, shaped.sizeTier);
  const partition =
    shaped.kingdoms.length > 0
      ? partitionKingdoms(
          terrain,
          shaped.kingdoms.map((kingdom) => kingdom.subtreeCount),
          hashStringToSeed(shaped.nodeId),
        )
      : null;

  const kingdoms = shaped.kingdoms.map((kingdom, kingdomIndex) => {
    const territory = partition?.territories[kingdomIndex];
    return buildKingdom(
      kingdom,
      kingdomIndex,
      terrain,
      territory?.cellIndices ?? [],
      territory?.labelPosition ?? { x: 0, y: 0 },
      center,
    );
  });

  const villageLocalPositions = kingdoms.flatMap((kingdom) =>
    kingdom.villages.map((village) => ({
      x: village.position.x - center.x,
      y: village.position.y - center.y,
    })),
  );

  return {
    nodeId: shaped.nodeId,
    label: shaped.label,
    center,
    radius,
    coastLoops: terrain.coastLoops.map((loop) => translatePath(loop, center)),
    landCells: buildLandCells(terrain, center),
    rivers: buildRivers(terrain, center),
    kingdomBorderPaths: (partition?.borderPaths ?? []).map((path) => translatePath(path, center)),
    hills: pickHills(terrain, shaped, villageLocalPositions, center),
    kingdoms,
    memberNodeIds: shaped.memberNodeIds,
  };
}

export function buildWorldModel(nodes: readonly KnowledgeNodeRow[]): WorldModel {
  const shapedIslands = shapeTree(nodes);
  const centers = packIslandCenters(
    shapedIslands.map((shaped) => islandRadiusForTier(shaped.sizeTier)),
  );
  return {
    islands: shapedIslands.map((shaped, index) =>
      buildIsland(shaped, centers[index] ?? { x: 0, y: 0 }),
    ),
  };
}
