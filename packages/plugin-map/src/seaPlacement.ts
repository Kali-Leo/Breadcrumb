/**
 * Purpose: deterministic rejection sampling of a free spot in the open sea — the one rule
 * shared by unnamed islets and the map's sea decorations, so neither ever lands on a coast.
 * Main exports: findOpenSeaPoint, SeaObstacle, SeaBox.
 */
import type { SeededRandom } from "./random";
import type { WorldPoint } from "./types";

export interface SeaObstacle {
  center: WorldPoint;
  /** Minimum distance a sampled point must keep from this center (world units). */
  clearance: number;
}

export interface SeaBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Draws points inside the box until one clears every obstacle. Returns null when the sea is
 * too crowded after `attempts` draws — callers decide whether to fall back or to skip.
 */
export function findOpenSeaPoint(
  random: SeededRandom,
  box: SeaBox,
  obstacles: readonly SeaObstacle[],
  attempts: number,
): WorldPoint | null {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate: WorldPoint = {
      x: box.minX + random() * (box.maxX - box.minX),
      y: box.minY + random() * (box.maxY - box.minY),
    };
    const clear = obstacles.every(
      (obstacle) =>
        Math.hypot(candidate.x - obstacle.center.x, candidate.y - obstacle.center.y) >=
        obstacle.clearance,
    );
    if (clear) return candidate;
  }
  return null;
}
