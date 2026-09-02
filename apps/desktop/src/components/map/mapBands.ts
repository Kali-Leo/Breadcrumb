/**
 * Purpose: the level transition's band visibility — the snap path (both bands and the
 * borders jump straight to the level's end state) and the animated path (everything
 * level-bound hides for the ride, and the incoming band shows in full once the camera
 * lands, all at once — Leo 2026-08-15: terrain-only zoom, then everything immediately; no
 * crossfade, no staggered reveal).
 * Main exports: PendingAppear, applyBandsInstant, beginAppearTransition, advancePendingAppear.
 *
 * Directory note: the non-component .ts files in components/map/ are the Pixi rendering
 * layer and belong to the view layer; logic with no DOM or Pixi lives in lib/.
 */
import type { Container } from "pixi.js";
import type { MapLevel } from "./levels";
import type { WorldScene } from "./sceneBuild";

/** The camera counts as arrived once its scale is within this fraction of the target —
 * that is when the level's content shows. */
const SETTLE_SCALE_RATIO = 0.04;

/** One level-transition in flight: the incoming band waits hidden until the camera lands. */
export interface PendingAppear {
  band: Container;
  showBorders: boolean;
}

/** Snap path: both bands and the borders jump straight to the level's end state. */
export function applyBandsInstant(scene: WorldScene, level: MapLevel): void {
  const atIsland = level.kind === "island";
  scene.worldBand.visible = !atIsland;
  scene.worldBand.alpha = atIsland ? 0 : 1;
  scene.islandBand.visible = atIsland;
  scene.islandBand.alpha = atIsland ? 1 : 0;
  scene.bordersLayer.visible = atIsland;
  scene.bordersLayer.alpha = atIsland ? 1 : 0;
}

/** Animated path: everything level-bound hides for the ride and the incoming band
 * (plus borders at the island level) shows in full once the camera lands. */
export function beginAppearTransition(scene: WorldScene, level: MapLevel): PendingAppear {
  const atIsland = level.kind === "island";
  scene.worldBand.visible = false;
  scene.islandBand.visible = false;
  scene.bordersLayer.visible = false;
  return { band: atIsland ? scene.islandBand : scene.worldBand, showBorders: atIsland };
}

/** Reveals the pending band once the camera has settled; returns the still-pending
 * transition (null once it has been applied). */
export function advancePendingAppear(input: {
  pending: PendingAppear | null;
  scene: WorldScene | null;
  currentScale: number;
  targetScale: number;
}): PendingAppear | null {
  const { pending, scene } = input;
  if (pending === null || scene === null) return pending;
  const settled =
    Math.abs(input.currentScale - input.targetScale) <= input.targetScale * SETTLE_SCALE_RATIO;
  if (!settled) return pending;
  pending.band.visible = true;
  pending.band.alpha = 1;
  if (pending.showBorders) {
    scene.bordersLayer.visible = true;
    scene.bordersLayer.alpha = 1;
  }
  return null;
}
