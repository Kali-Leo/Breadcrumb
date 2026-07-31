/**
 * Purpose: the discrete level model — world/island/kingdom/village, exact-fit camera
 * frames per level and pointer hit-tests for wheel dives. Pure functions.
 * Main exports: MapLevel, CameraFrame, frameForLevel, hitIsland, hitKingdom, hitVillage.
 */
import {
  type IslandModel,
  type KingdomModel,
  pointInPolygon,
  type VillageModel,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { type Bounds, worldBounds } from "./seaArt";

export type MapLevel =
  | { kind: "world" }
  | { kind: "island"; islandId: string }
  | { kind: "kingdom"; islandId: string; kingdomId: string }
  | { kind: "village"; islandId: string; kingdomId: string; villageId: string };

export interface CameraFrame {
  scale: number;
  x: number;
  y: number;
}

export function findIsland(world: WorldModel, islandId: string): IslandModel | undefined {
  return world.islands.find((island) => island.nodeId === islandId);
}

export function findKingdom(island: IslandModel, kingdomId: string): KingdomModel | undefined {
  return island.kingdoms.find((kingdom) => kingdom.nodeId === kingdomId);
}

export function findVillage(kingdom: KingdomModel, villageId: string): VillageModel | undefined {
  return kingdom.villages.find((village) => village.nodeId === villageId);
}

function frameFromBounds(
  bounds: Bounds,
  screenWidth: number,
  screenHeight: number,
  fill: number,
): CameraFrame {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(screenWidth / width, screenHeight / height) * fill;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: screenWidth / 2 - centerX * scale,
    y: screenHeight / 2 - centerY * scale,
  };
}

function kingdomBounds(kingdom: KingdomModel): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of kingdom.cellPolygons) {
    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = kingdom.labelPosition.x - 150;
    minY = kingdom.labelPosition.y - 150;
    maxX = kingdom.labelPosition.x + 150;
    maxY = kingdom.labelPosition.y + 150;
  }
  return { minX: minX - 40, minY: minY - 40, maxX: maxX + 40, maxY: maxY + 40 };
}

/** Every level frames its region to exactly fill the window (no panning). */
export function frameForLevel(
  world: WorldModel,
  level: MapLevel,
  screenWidth: number,
  screenHeight: number,
): CameraFrame {
  if (level.kind === "world") {
    return frameFromBounds(worldBounds(world), screenWidth, screenHeight, 0.98);
  }
  const island = findIsland(world, level.islandId);
  if (island === undefined) {
    return frameFromBounds(worldBounds(world), screenWidth, screenHeight, 0.98);
  }
  if (level.kind === "island") {
    const reach = island.radius * 1.18;
    return frameFromBounds(
      {
        minX: island.center.x - reach,
        minY: island.center.y - reach,
        maxX: island.center.x + reach,
        maxY: island.center.y + reach,
      },
      screenWidth,
      screenHeight,
      0.94,
    );
  }
  const kingdom = findKingdom(island, level.kingdomId);
  if (kingdom === undefined) {
    return frameForLevel(
      world,
      { kind: "island", islandId: island.nodeId },
      screenWidth,
      screenHeight,
    );
  }
  // Kingdom and village levels share the kingdom frame; the village opens an overlay.
  return frameFromBounds(kingdomBounds(kingdom), screenWidth, screenHeight, 0.92);
}

export function hitIsland(world: WorldModel, point: WorldPoint): IslandModel | null {
  let best: IslandModel | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const island of world.islands) {
    const distance = Math.hypot(point.x - island.center.x, point.y - island.center.y);
    if (distance < island.radius * 1.35 && distance < bestDistance) {
      bestDistance = distance;
      best = island;
    }
  }
  return best;
}

export function hitKingdom(island: IslandModel, point: WorldPoint): KingdomModel | null {
  for (const kingdom of island.kingdoms) {
    for (const polygon of kingdom.cellPolygons) {
      if (pointInPolygon(point, polygon)) return kingdom;
    }
  }
  let best: KingdomModel | null = null;
  let bestDistance = 260;
  for (const kingdom of island.kingdoms) {
    const distance = Math.hypot(
      point.x - kingdom.labelPosition.x,
      point.y - kingdom.labelPosition.y,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = kingdom;
    }
  }
  return best;
}

export function hitVillage(kingdom: KingdomModel, point: WorldPoint): VillageModel | null {
  let best: VillageModel | null = null;
  let bestDistance = 110;
  for (const village of kingdom.villages) {
    const distance = Math.hypot(point.x - village.position.x, point.y - village.position.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = village;
    }
  }
  return best;
}
