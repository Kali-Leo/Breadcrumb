/**
 * Purpose: the discrete level model — world → island only (the kingdom and village dive
 * levels were removed 2026-08-11, backed up on branch backup/village-town-scene; an
 * enlarged continent showing its kingdom regions is now the deepest view), exact-fit
 * camera frames per level and pointer hit-tests.
 * Main exports: MapLevel, CameraFrame, CAMERA_EASE_RATE, CAMERA_SETTLE_MS, frameForLevel,
 * findIsland, hitIsland, hitIslet, hitKingdom.
 */
import {
  type IslandModel,
  type IsletModel,
  type KingdomModel,
  pointInPolygon,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/feature-map";
import { type Bounds, worldBounds } from "./seaArt";

export type MapLevel = { kind: "world" } | { kind: "island"; islandId: string };

export interface CameraFrame {
  scale: number;
  x: number;
  y: number;
}

/** Exponential approach rate of the camera toward its frame, per second (mapController.tick). */
export const CAMERA_EASE_RATE = 7;

/** How long a level change takes to land: the camera closes 99% of the distance to its frame
 * in ln(100) / CAMERA_EASE_RATE seconds. Input cooldowns are derived from this rather than
 * guessed, so "one gesture per camera flight" stays true if the easing is ever retuned
 * (bug hunt 2026-09-03: a 380 ms wheel cooldown let a second notch fire mid-flight). */
export const CAMERA_SETTLE_MS = Math.ceil((Math.log(100) / CAMERA_EASE_RATE) * 1000);

export function findIsland(world: WorldModel, islandId: string): IslandModel | undefined {
  return world.islands.find((island) => island.nodeId === islandId);
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

/** Every level frames its region to exactly fill the window (no panning). */
export function frameForLevel(
  world: WorldModel,
  level: MapLevel,
  screenWidth: number,
  screenHeight: number,
): CameraFrame {
  const island = level.kind === "island" ? findIsland(world, level.islandId) : undefined;
  if (island === undefined) {
    return frameFromBounds(worldBounds(world), screenWidth, screenHeight, 0.98);
  }
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

/** Islets answer hovers only — they are never a dive target, so they stay out of hitIsland. */
export function hitIslet(world: WorldModel, point: WorldPoint): IsletModel | null {
  let best: IsletModel | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const islet of world.islets) {
    const distance = Math.hypot(point.x - islet.center.x, point.y - islet.center.y);
    if (distance < islet.radius * 1.5 && distance < bestDistance) {
      bestDistance = distance;
      best = islet;
    }
  }
  return best;
}

/** Kingdoms answer hovers at the island level — the deepest view, so never a dive target. */
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
