/**
 * Purpose: one landmass' terrain in the Laham style (Nortantis official sample #3) —
 * sepia land with subtle relief shading, official coast shading bands inside and a
 * soft ocean shade outside, clean thin ink coastline. Continents and islets share it.
 * Main exports: drawLandmass, LandmassShape.
 */
import { type LandCellModel, pointInPolygon, type WorldPoint } from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import Offset from "polygon-offset";
import { mapTheme } from "./mapTheme";

const RELIEF_SHADE = 0xb0996e;

/** The only geometry the land drawing needs — an IslandModel or an IsletModel fits it. */
export interface LandmassShape {
  coastLoops: WorldPoint[][];
  landCells: LandCellModel[];
}

/** Coast loops after the first are lakes when they sit inside the main landmass. */
function isLake(loop: readonly WorldPoint[], outerLoop: readonly WorldPoint[]): boolean {
  const probe = loop.at(0);
  return probe !== undefined && pointInPolygon(probe, outerLoop);
}

/**
 * Nortantis coast shading: a soft darkened band just inside the shoreline —
 * whole island tinted, interior repainted, widest band first so passes stack.
 */
/** polygon-offset warn-floods ("Edges of the same polygon overlap …") on coast loops it
 * still processes fine; hundreds of these turn the dev overlay into a wall of red and
 * measurably slow the scene build. Suppress exactly that message, nothing else. */
function paddingWithoutOverlapWarnings(
  offset: Offset,
  inset: number,
): ReturnType<Offset["padding"]> {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("Edges of the same polygon overlap")) {
      return;
    }
    originalWarn(...args);
  };
  try {
    return offset.padding(inset);
  } finally {
    console.warn = originalWarn;
  }
}

function drawCoastShading(graphics: Graphics, loop: readonly WorldPoint[]): void {
  const ringSource = loop.map((point) => [point.x, point.y] as [number, number]);
  for (const [inset, alpha] of [
    [11, 0.05],
    [5, 0.06],
  ] as const) {
    try {
      const interior = paddingWithoutOverlapWarnings(new Offset().data([ringSource]), inset);
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

function drawLandAndShading(graphics: Graphics, island: LandmassShape): void {
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

function drawLakesAndCoast(graphics: Graphics, island: LandmassShape): void {
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

export function drawLandmass(landmass: LandmassShape): Graphics {
  const graphics = new Graphics();
  drawLandAndShading(graphics, landmass);
  drawLakesAndCoast(graphics, landmass);
  return graphics;
}
