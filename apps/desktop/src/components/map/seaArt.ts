/**
 * Purpose: the sea and frame in the Laham style — plain ivory ocean, the official
 * double-line map frame, a hand-drawn compass rose and rare official sea decorations
 * (grid-keyed so a growing world never reshuffles them).
 * Main exports: buildSeaLayer, worldBounds.
 */
import { createSeededRandom, hashStringToSeed, type WorldModel } from "@breadcrumb/plugin-map";
import { Container, Graphics, Sprite } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { mapTheme } from "./mapTheme";

const GRID_STEP = 260;
const PADDING = 240;
/** One decoration roughly every this many sea grid cells. */
const DECOR_RARITY = 60;

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
  for (const island of world.islands) {
    minX = Math.min(minX, island.center.x - island.radius - PADDING);
    minY = Math.min(minY, island.center.y - island.radius - PADDING);
    maxX = Math.max(maxX, island.center.x + island.radius + PADDING);
    maxY = Math.max(maxY, island.center.y + island.radius + PADDING);
  }
  return { minX, minY, maxX, maxY };
}

/** Laham's frame: a heavier outer rule with a fine inner rule. */
function drawLahamFrame(graphics: Graphics, bounds: Bounds): void {
  const outerGap = 0;
  const innerGap = 14;
  graphics.rect(
    bounds.minX - outerGap,
    bounds.minY - outerGap,
    bounds.maxX - bounds.minX + outerGap * 2,
    bounds.maxY - bounds.minY + outerGap * 2,
  );
  graphics.stroke({ width: 5, color: mapTheme.ink, alpha: 0.9 });
  graphics.rect(
    bounds.minX + innerGap,
    bounds.minY + innerGap,
    bounds.maxX - bounds.minX - innerGap * 2,
    bounds.maxY - bounds.minY - innerGap * 2,
  );
  graphics.stroke({ width: 1.2, color: mapTheme.ink, alpha: 0.85 });
}

export function buildSeaLayer(world: WorldModel, art: MapArt): Container {
  const layer = new Container();
  const graphics = new Graphics();
  layer.addChild(graphics);
  const bounds = worldBounds(world);

  // Rare official decorations (ships, sea creatures) in open water.
  for (
    let gridX = Math.floor(bounds.minX / GRID_STEP);
    gridX * GRID_STEP < bounds.maxX;
    gridX += 1
  ) {
    for (
      let gridY = Math.floor(bounds.minY / GRID_STEP);
      gridY * GRID_STEP < bounds.maxY;
      gridY += 1
    ) {
      const random = createSeededRandom(hashStringToSeed(`sea:${gridX}:${gridY}`));
      const x = (gridX + 0.2 + random() * 0.6) * GRID_STEP;
      const y = (gridY + 0.2 + random() * 0.6) * GRID_STEP;
      const nearLand = world.islands.some(
        (island) =>
          Math.hypot(x - island.center.x, y - island.center.y) < island.radius * 1.45 + 60,
      );
      if (nearLand) continue;
      if (random() > 1 - 1 / DECOR_RARITY && art.seaDecor.length > 0) {
        const texture = art.seaDecor[Math.floor(random() * art.seaDecor.length)];
        if (texture !== undefined) {
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          const width = 70 + random() * 30;
          const scale = width / Math.max(texture.width, 1);
          sprite.scale.set(random() < 0.5 ? -scale : scale, scale);
          sprite.position.set(x, y);
          sprite.alpha = 0.8;
          layer.addChild(sprite);
        }
      }
    }
  }

  const compass = new Sprite(art.compass);
  compass.anchor.set(0.5);
  compass.scale.set(150 / Math.max(art.compass.width, 1));
  compass.position.set(bounds.minX + 160, bounds.minY + 160);
  compass.alpha = 0.8;
  layer.addChild(compass);

  drawLahamFrame(graphics, bounds);
  return layer;
}
