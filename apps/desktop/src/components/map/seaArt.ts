/**
 * Purpose: the ocean's ambience — deterministic speckle-and-wave field around the
 * islands plus a compass rose. Pure decoration, stable as the world grows.
 * Main exports: drawSeaField.
 */
import { createSeededRandom, hashStringToSeed, type WorldModel } from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import { drawWaveGlyph } from "./drawPrimitives";
import { mapTheme } from "./mapTheme";

const GRID_STEP = 130;
const PADDING = 420;

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

function drawCompassRose(graphics: Graphics, x: number, y: number): void {
  graphics.circle(x, y, 46).stroke({ width: 1.6, color: mapTheme.ink, alpha: 0.4 });
  graphics.circle(x, y, 34).stroke({ width: 0.8, color: mapTheme.ink, alpha: 0.3 });
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (ray * Math.PI) / 4;
    const isCardinal = ray % 2 === 0;
    const length = isCardinal ? 44 : 28;
    graphics.moveTo(x, y);
    graphics.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    graphics.stroke({
      width: isCardinal ? 1.4 : 0.9,
      color: mapTheme.ink,
      alpha: isCardinal ? 0.45 : 0.3,
    });
  }
  // North needle.
  graphics.poly(
    [
      { x, y: y - 58 },
      { x: x + 4.5, y: y - 40 },
      { x: x - 4.5, y: y - 40 },
    ],
    true,
  );
  graphics.fill({ color: mapTheme.ink, alpha: 0.5 });
}

/** Sea decor is keyed by grid coordinates, so growing the world never reshuffles it. */
export function drawSeaField(world: WorldModel): Graphics {
  const graphics = new Graphics();
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
        (island) => Math.hypot(x - island.center.x, y - island.center.y) < island.radius * 1.3 + 30,
      );
      if (nearLand) continue;
      const roll = random();
      if (roll < 0.3) {
        graphics.circle(x, y, 0.8 + random() * 0.6);
        graphics.fill({ color: mapTheme.inkSoft, alpha: 0.05 + random() * 0.04 });
      } else if (roll < 0.42) {
        drawWaveGlyph(graphics, { x, y });
      }
    }
  }

  drawCompassRose(graphics, bounds.minX + 200, bounds.minY + 200);
  return graphics;
}
