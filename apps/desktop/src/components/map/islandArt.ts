/**
 * Purpose: draws one island's always-visible terrain into a Graphics — land fill,
 * kingdom territory tints, coast ink with halo, seaward stipples and hill glyphs.
 * Main exports: drawIslandTerrain.
 */
import type { IslandModel } from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import { drawCoastStipples, drawHillGlyph } from "./drawPrimitives";
import { mapTheme } from "./mapTheme";

export function drawIslandTerrain(island: IslandModel): Graphics {
  const graphics = new Graphics();

  for (const loop of island.coastLoops) {
    graphics.poly(loop, true).fill({ color: mapTheme.landFill });
  }

  // Fill and stroke each territory cell in the same tint so cell seams disappear.
  for (const kingdom of island.kingdoms) {
    const tint = mapTheme.kingdomTints[kingdom.tintIndex] ?? mapTheme.landFill;
    for (const polygon of kingdom.cellPolygons) {
      graphics
        .poly(polygon, true)
        .fill({ color: tint, alpha: 0.28 })
        .stroke({ width: 1.2, color: tint, alpha: 0.28 });
    }
  }

  for (const loop of island.coastLoops) {
    graphics.poly(loop, true).stroke({ width: 5, color: mapTheme.ink, alpha: 0.1, join: "round" });
    graphics.poly(loop, true).stroke({ width: 2, color: mapTheme.ink, alpha: 0.95, join: "round" });
    drawCoastStipples(graphics, loop, island.center);
  }

  for (const hill of island.hills) {
    drawHillGlyph(graphics, hill);
  }

  return graphics;
}
