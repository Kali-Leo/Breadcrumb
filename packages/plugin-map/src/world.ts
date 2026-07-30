/**
 * Purpose: pipeline orchestrator — knowledge rows in, fully placed geometric world out.
 * Every island is generated in local coordinates then translated to its fixed slot.
 * Main exports: buildWorldModel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { islandRadiusForTier, islandSlotCenter } from "./layout";
import { createSeededRandom, hashStringToSeed } from "./random";
import { partitionKingdoms } from "./regions";
import { placeVillagePoints, placeVillages } from "./settlements";
import { generateTerrain, type IslandTerrain } from "./terrain";
import { type ShapedIsland, type ShapedKingdom, shapeTree } from "./treeShape";
import type { IslandModel, KingdomModel, VillageModel, WorldModel, WorldPoint } from "./types";

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

function buildIsland(shaped: ShapedIsland, slotIndex: number): IslandModel {
  const center = islandSlotCenter(slotIndex);
  const radius = islandRadiusForTier(shaped.sizeTier);
  const terrain = generateTerrain(hashStringToSeed(shaped.nodeId), radius);
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
    kingdomBorderPaths: (partition?.borderPaths ?? []).map((path) => translatePath(path, center)),
    hills: pickHills(terrain, shaped, villageLocalPositions, center),
    kingdoms,
    memberNodeIds: shaped.memberNodeIds,
  };
}

export function buildWorldModel(nodes: readonly KnowledgeNodeRow[]): WorldModel {
  return { islands: shapeTree(nodes).map((shaped, slotIndex) => buildIsland(shaped, slotIndex)) };
}
