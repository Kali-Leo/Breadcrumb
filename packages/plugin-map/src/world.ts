/**
 * Purpose: pipeline orchestrator — knowledge rows in, fully placed geometric world out.
 * Every island is generated in local coordinates then translated to its fixed slot. Islands
 * are shaped by discovered topics when a TopicAssignment is supplied, else by tree roots;
 * that assignment's one-touch interests become unnamed islets in the open sea.
 * Main exports: buildWorldModel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { buildIslets } from "./isletBuild";
import { islandRadiusForTier, packIslandCenters } from "./layout";
import { createSeededRandom, hashStringToSeed } from "./random";
import { partitionKingdoms } from "./regions";
import { placeVillagePoints, placeVillages } from "./settlements";
import type { IslandTerrain } from "./terrain";
import { buildLandCells, buildRivers, terrainFor, translate, translatePath } from "./terrainParts";
import { shapeTopicIslands } from "./topicShape";
import type { TopicAssignment } from "./topics";
import { type ShapedIsland, type ShapedKingdom, shapeTree } from "./treeShape";
import type { IslandModel, KingdomModel, VillageModel, WorldModel, WorldPoint } from "./types";

const TINT_PALETTE_SIZE = 4;
const HILL_COUNT_BASE = 3;
/** Hills keep this far from any village so glyphs never overlap (world units). */
const HILL_CLEARANCE = 16;

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

export function buildWorldModel(
  nodes: readonly KnowledgeNodeRow[],
  topicAssignment?: TopicAssignment,
): WorldModel {
  // An assignment that produced only islets still speaks for the data (nothing has clustered
  // yet) — falling back to tree roots there would draw continents the topics denied.
  const shapedIslands =
    topicAssignment !== undefined &&
    (topicAssignment.topics.length > 0 || topicAssignment.islets.length > 0)
      ? shapeTopicIslands(nodes, topicAssignment)
      : shapeTree(nodes);
  const centers = packIslandCenters(
    shapedIslands.map((shaped) => islandRadiusForTier(shaped.sizeTier)),
  );
  const islands = shapedIslands.map((shaped, index) =>
    buildIsland(shaped, centers[index] ?? { x: 0, y: 0 }),
  );
  return {
    islands,
    islets: topicAssignment === undefined ? [] : buildIslets(topicAssignment.islets, islands),
  };
}
