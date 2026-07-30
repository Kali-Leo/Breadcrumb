/**
 * Purpose: one island's relief and vegetation — mewo2-style slope hatching oriented
 * by the downhill direction, mountain/hill glyphs on high ground and moisture-driven
 * woods, all thinned by spacing so the engraving stays legible.
 * Main exports: drawIslandRelief.
 */
import {
  createSeededRandom,
  hashStringToSeed,
  type IslandModel,
  type LandCellModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import { drawHillGlyph, drawMountainGlyph, drawTreeGlyph } from "./drawPrimitives";
import { mapTheme } from "./mapTheme";

/** Minimum spacing between glyph anchors (world units). */
const MOUNTAIN_SPACING = 17;
const HILL_SPACING = 14;
const TREE_SPACING = 15;
const SETTLEMENT_CLEARANCE = 20;

function farFromAll(point: WorldPoint, placed: readonly WorldPoint[], spacing: number): boolean {
  return placed.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= spacing);
}

function drawSlopeHatching(
  graphics: Graphics,
  cells: readonly LandCellModel[],
  random: () => number,
): void {
  for (const cell of cells) {
    if (cell.slope01 < 0.3) continue;
    const strokes = 1 + Math.round(cell.slope01 * 2);
    const length = 3.5 + cell.slope01 * 4;
    for (let stroke = 0; stroke < strokes; stroke += 1) {
      const offsetX = (random() - 0.5) * 8;
      const offsetY = (random() - 0.5) * 8;
      const angle = cell.downhillAngle + (random() - 0.5) * 0.5;
      const x = cell.site.x + offsetX;
      const y = cell.site.y + offsetY;
      graphics.moveTo(x - (Math.cos(angle) * length) / 2, y - (Math.sin(angle) * length) / 2);
      graphics.lineTo(x + (Math.cos(angle) * length) / 2, y + (Math.sin(angle) * length) / 2);
    }
  }
  graphics.stroke({ width: 0.7, color: mapTheme.ink, alpha: 0.28, cap: "round" });
}

export interface IslandRelief {
  /** Mountains and hills — landmarks, visible at every zoom. */
  landmarks: Graphics;
  /** Hatching and woods — engraving detail that fades in past the geographic view. */
  detail: Graphics;
}

export function drawIslandRelief(island: IslandModel): IslandRelief {
  const landmarks = new Graphics();
  const detail = new Graphics();
  const random = createSeededRandom(hashStringToSeed(island.nodeId) ^ 0x51ab);
  const settlements = island.kingdoms.flatMap((kingdom) =>
    kingdom.villages.map((village) => village.position),
  );

  drawSlopeHatching(detail, island.landCells, random);

  const byHeight = [...island.landCells].sort((a, b) => b.height01 - a.height01);
  const placed: WorldPoint[] = [...settlements];

  // Mountains crown the highest ground, hills ring them, woods take moist lowlands.
  for (const cell of byHeight) {
    const jitter = { x: cell.site.x + (random() - 0.5) * 6, y: cell.site.y + (random() - 0.5) * 6 };
    const nearSettlement = !farFromAll(jitter, settlements, SETTLEMENT_CLEARANCE);
    if (nearSettlement) continue;
    if (cell.height01 >= 0.68) {
      if (farFromAll(jitter, placed, MOUNTAIN_SPACING)) {
        drawMountainGlyph(landmarks, jitter);
        placed.push(jitter);
      }
    } else if (cell.height01 >= 0.45 && cell.slope01 >= 0.25) {
      if (random() < 0.75 && farFromAll(jitter, placed, HILL_SPACING)) {
        drawHillGlyph(landmarks, jitter);
        placed.push(jitter);
      }
    } else if (cell.height01 < 0.42 && cell.flux01 < 0.04 && cell.slope01 < 0.45) {
      if (random() < 0.35 && farFromAll(jitter, placed, TREE_SPACING)) {
        drawTreeGlyph(detail, jitter, 0.8 + random() * 0.4);
        if (random() < 0.5) {
          drawTreeGlyph(
            detail,
            { x: jitter.x + 7 + random() * 3, y: jitter.y + 2 + random() * 2 },
            0.65 + random() * 0.3,
          );
        }
        placed.push(jitter);
      }
    }
  }
  return { landmarks, detail };
}
