/**
 * Purpose: the sea and frame in the Laham style — a plain ivory ocean inside the
 * official double-rule map frame. Decorations were removed at founder request:
 * the map stays clean.
 * Main exports: buildSeaLayer, worldBounds, Bounds.
 */
import type { WorldModel } from "@breadcrumb/feature-map";
import { Container, Graphics } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { mapTheme } from "./mapTheme";

const PADDING = 240;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function worldBounds(world: WorldModel): Bounds {
  let minX = -PADDING;
  let minY = -PADDING;
  let maxX = PADDING;
  let maxY = PADDING;
  // Islets count too — the frame must contain the whole sea, not only the continents.
  for (const landmass of [...world.islands, ...world.islets]) {
    minX = Math.min(minX, landmass.center.x - landmass.radius - PADDING);
    minY = Math.min(minY, landmass.center.y - landmass.radius - PADDING);
    maxX = Math.max(maxX, landmass.center.x + landmass.radius + PADDING);
    maxY = Math.max(maxY, landmass.center.y + landmass.radius + PADDING);
  }
  return { minX, minY, maxX, maxY };
}

/** Laham's frame: a heavier outer rule with a fine inner rule. */
function drawLahamFrame(graphics: Graphics, bounds: Bounds): void {
  const innerGap = 14;
  graphics.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  graphics.stroke({ width: 5, color: mapTheme.ink, alpha: 0.9 });
  graphics.rect(
    bounds.minX + innerGap,
    bounds.minY + innerGap,
    bounds.maxX - bounds.minX - innerGap * 2,
    bounds.maxY - bounds.minY - innerGap * 2,
  );
  graphics.stroke({ width: 1.2, color: mapTheme.ink, alpha: 0.85 });
}

export function buildSeaLayer(world: WorldModel, _art: MapArt): Container {
  const layer = new Container();
  const graphics = new Graphics();
  layer.addChild(graphics);
  drawLahamFrame(graphics, worldBounds(world));
  return layer;
}
