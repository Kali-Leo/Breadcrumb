/**
 * Purpose: draws one island's always-visible terrain — layered water lines, land fill
 * with per-cell relief shading, kingdom tints, lakes, coast ink, seaward stipples and
 * height-banded mountain/hill/tree glyphs.
 * Main exports: drawIslandTerrain.
 */
import {
  createSeededRandom,
  hashStringToSeed,
  type IslandModel,
  pointInPolygon,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import {
  drawCoastStipples,
  drawHillGlyph,
  drawMountainGlyph,
  drawTreeGlyph,
} from "./drawPrimitives";
import { mapTheme } from "./mapTheme";

const RELIEF_SHADE = 0xb0996e;
/** Relief glyphs keep this far from any settlement (world units). */
const SETTLEMENT_CLEARANCE = 22;

/** Coast loops after the first are lakes when they sit inside the main landmass. */
function isLake(loop: readonly WorldPoint[], outerLoop: readonly WorldPoint[]): boolean {
  const probe = loop.at(0);
  return probe !== undefined && pointInPolygon(probe, outerLoop);
}

function drawWaterLines(graphics: Graphics, island: IslandModel): void {
  for (const loop of island.coastLoops) {
    graphics
      .poly(loop, true)
      .stroke({ width: 30, color: mapTheme.inkSoft, alpha: 0.04, join: "round" });
    graphics
      .poly(loop, true)
      .stroke({ width: 17, color: mapTheme.inkSoft, alpha: 0.055, join: "round" });
    graphics
      .poly(loop, true)
      .stroke({ width: 8, color: mapTheme.inkSoft, alpha: 0.085, join: "round" });
  }
}

function drawLandAndShading(graphics: Graphics, island: IslandModel): void {
  const outerLoop = island.coastLoops.at(0) ?? [];
  for (const loop of island.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) continue;
    graphics.poly(loop, true).fill({ color: mapTheme.landFill });
  }
  // Relief shading: higher cells get a deeper warm tone; stroke hides cell seams.
  for (const cell of island.landCells) {
    const alpha = 0.05 + 0.17 * cell.height01;
    graphics
      .poly(cell.polygon, true)
      .fill({ color: RELIEF_SHADE, alpha })
      .stroke({ width: 1.2, color: RELIEF_SHADE, alpha });
  }
}

function drawKingdomTints(graphics: Graphics, island: IslandModel): void {
  for (const kingdom of island.kingdoms) {
    const tint = mapTheme.kingdomTints[kingdom.tintIndex] ?? mapTheme.landFill;
    for (const polygon of kingdom.cellPolygons) {
      graphics
        .poly(polygon, true)
        .fill({ color: tint, alpha: 0.22 })
        .stroke({ width: 1.2, color: tint, alpha: 0.22 });
    }
  }
}

function drawLakesAndCoast(graphics: Graphics, island: IslandModel): void {
  const outerLoop = island.coastLoops.at(0) ?? [];
  for (const loop of island.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) {
      graphics.poly(loop, true).fill({ color: mapTheme.parchment });
    }
  }
  for (const loop of island.coastLoops) {
    graphics.poly(loop, true).stroke({ width: 5, color: mapTheme.ink, alpha: 0.12, join: "round" });
    graphics
      .poly(loop, true)
      .stroke({ width: 2.2, color: mapTheme.ink, alpha: 0.95, join: "round" });
    drawCoastStipples(graphics, loop, island.center);
  }
}

function drawRelief(graphics: Graphics, island: IslandModel): void {
  const random = createSeededRandom(hashStringToSeed(island.nodeId) ^ 0x51ab);
  const settlements = island.kingdoms.flatMap((kingdom) =>
    kingdom.villages.map((village) => village.position),
  );
  for (const cell of island.landCells) {
    const roll = random();
    const jitterX = (random() - 0.5) * 7;
    const jitterY = (random() - 0.5) * 7;
    const nearSettlement = settlements.some(
      (village) =>
        Math.hypot(cell.site.x - village.x, cell.site.y - village.y) < SETTLEMENT_CLEARANCE,
    );
    if (nearSettlement) continue;
    const anchor = { x: cell.site.x + jitterX, y: cell.site.y + jitterY };
    if (cell.height01 >= 0.72) {
      drawMountainGlyph(graphics, anchor);
    } else if (cell.height01 >= 0.45) {
      if (roll < 0.7) drawHillGlyph(graphics, anchor);
    } else if (cell.height01 >= 0.16 && roll < 0.55) {
      drawTreeGlyph(graphics, anchor, 0.85 + random() * 0.4);
      if (random() < 0.45) {
        drawTreeGlyph(
          graphics,
          { x: anchor.x + 8 + random() * 4, y: anchor.y + 2 + random() * 3 },
          0.7 + random() * 0.3,
        );
      }
    }
  }
}

export function drawIslandTerrain(island: IslandModel): Graphics {
  const graphics = new Graphics();
  drawWaterLines(graphics, island);
  drawLandAndShading(graphics, island);
  drawKingdomTints(graphics, island);
  drawLakesAndCoast(graphics, island);
  drawRelief(graphics, island);
  return graphics;
}
