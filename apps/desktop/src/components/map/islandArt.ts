/**
 * Purpose: one island's terrain in the Laham style (Nortantis official sample #3) —
 * sepia land with subtle relief shading, official coast shading bands inside and a
 * soft ocean shade outside, clean thin ink coastline, thin ink rivers.
 * Main exports: drawIslandTerrain.
 */
import { type IslandModel, pointInPolygon, type WorldPoint } from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import Offset from "polygon-offset";
import { mapTheme } from "./mapTheme";

const RELIEF_SHADE = 0xb0996e;

/** Coast loops after the first are lakes when they sit inside the main landmass. */
function isLake(loop: readonly WorldPoint[], outerLoop: readonly WorldPoint[]): boolean {
  const probe = loop.at(0);
  return probe !== undefined && pointInPolygon(probe, outerLoop);
}

/**
 * Nortantis coast shading: a soft darkened band just inside the shoreline —
 * whole island tinted, interior repainted, widest band first so passes stack.
 */
function drawCoastShading(graphics: Graphics, loop: readonly WorldPoint[]): void {
  const ringSource = loop.map((point) => [point.x, point.y] as [number, number]);
  for (const [inset, alpha] of [
    [11, 0.05],
    [5, 0.06],
  ] as const) {
    try {
      const interior = new Offset().data([ringSource]).padding(inset);
      graphics.poly([...loop], true).fill({ color: mapTheme.inkSoft, alpha });
      for (const ring of interior) {
        graphics
          .poly(
            ring.map(([x, y]) => ({ x, y })),
            true,
          )
          .fill({ color: mapTheme.landFill });
      }
    } catch {
      graphics.poly([...loop], true);
      graphics.stroke({ width: inset, color: mapTheme.inkSoft, alpha: alpha * 0.8 });
    }
  }
}

function drawLandAndShading(graphics: Graphics, island: IslandModel): void {
  const outerLoop = island.coastLoops.at(0) ?? [];
  for (const loop of island.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) continue;
    graphics.poly([...loop], true).fill({ color: mapTheme.landFill });
    drawCoastShading(graphics, loop);
  }
  // Subtle sepia relief so highlands read darker, as in the Laham interior texture.
  for (const cell of island.landCells) {
    const alpha = 0.02 + 0.1 * cell.height01;
    graphics.poly(cell.polygon, true).fill({ color: RELIEF_SHADE, alpha });
  }
}

/** Laham rivers: thin dark-ink lines tapering downstream — never blue. */
function drawRivers(graphics: Graphics, island: IslandModel): void {
  for (const river of island.rivers) {
    const segments = river.points.length - 1;
    for (let index = 0; index < segments; index += 1) {
      const a = river.points[index];
      const b = river.points[index + 1];
      if (a === undefined || b === undefined) continue;
      const progress = segments > 0 ? index / segments : 0;
      graphics.moveTo(a.x, a.y);
      graphics.lineTo(b.x, b.y);
      graphics.stroke({
        width: (river.startWidth + (river.endWidth - river.startWidth) * progress) * 0.45,
        color: mapTheme.river,
        alpha: 0.85,
        cap: "round",
      });
    }
  }
}

function drawLakesAndCoast(graphics: Graphics, island: IslandModel): void {
  const outerLoop = island.coastLoops.at(0) ?? [];
  for (const loop of island.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) {
      graphics.poly([...loop], true).fill({ color: mapTheme.parchment });
    }
  }
  for (const loop of island.coastLoops) {
    // Official ocean shading: one soft wide shade outside, then the clean ink line.
    graphics
      .poly([...loop], true)
      .stroke({ width: 9, color: mapTheme.inkSoft, alpha: 0.08, join: "round" });
    graphics
      .poly([...loop], true)
      .stroke({ width: 1.3, color: mapTheme.ink, alpha: 0.95, join: "round" });
  }
}

export function drawIslandTerrain(island: IslandModel): Graphics {
  const graphics = new Graphics();
  drawLandAndShading(graphics, island);
  drawRivers(graphics, island);
  drawLakesAndCoast(graphics, island);
  return graphics;
}
