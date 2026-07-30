/**
 * Purpose: the ocean's ambience — deterministic speckle-and-wave field, a hand-drawn
 * compass rose and rare sea creatures/ships from the Nortantis art pack. Grid-keyed,
 * so a growing world never reshuffles its sea.
 * Main exports: buildSeaLayer.
 */
import { createSeededRandom, hashStringToSeed, type WorldModel } from "@breadcrumb/plugin-map";
import { Container, Graphics, Sprite } from "pixi.js";
import { drawWaveGlyph } from "./drawPrimitives";
import type { MapArt } from "./mapArtAssets";
import { mapTheme } from "./mapTheme";

const GRID_STEP = 130;
const PADDING = 420;
/** One decoration roughly every this many sea grid cells. */
const DECOR_RARITY = 220;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function worldBounds(world: WorldModel): Bounds {
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

export function buildSeaLayer(world: WorldModel, art: MapArt): Container {
  const layer = new Container();
  const graphics = new Graphics();
  layer.addChild(graphics);
  const bounds = worldBounds(world);

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
      const x = (gridX + 0.15 + random() * 0.7) * GRID_STEP;
      const y = (gridY + 0.15 + random() * 0.7) * GRID_STEP;
      const nearLand = world.islands.some(
        (island) => Math.hypot(x - island.center.x, y - island.center.y) < island.radius * 1.4 + 40,
      );
      if (nearLand) continue;
      const roll = random();
      if (roll < 0.28) {
        graphics.circle(x, y, 0.8 + random() * 0.6);
        graphics.fill({ color: mapTheme.inkSoft, alpha: 0.05 + random() * 0.04 });
      } else if (roll < 0.4) {
        drawWaveGlyph(graphics, { x, y });
      } else if (roll > 1 - 1 / DECOR_RARITY && art.seaDecor.length > 0) {
        const texture = art.seaDecor[Math.floor(random() * art.seaDecor.length)];
        if (texture !== undefined) {
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          const width = 70 + random() * 30;
          const scale = width / Math.max(texture.width, 1);
          sprite.scale.set(random() < 0.5 ? -scale : scale, scale);
          sprite.position.set(x, y);
          sprite.alpha = 0.85;
          layer.addChild(sprite);
        }
      }
    }
  }

  const compass = new Sprite(art.compass);
  compass.anchor.set(0.5);
  compass.scale.set(150 / Math.max(art.compass.width, 1));
  compass.position.set(bounds.minX + 220, bounds.minY + 220);
  compass.alpha = 0.8;
  layer.addChild(compass);
  return layer;
}
