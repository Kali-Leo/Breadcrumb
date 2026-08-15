/**
 * Purpose: one landmass' terrain in the Laham style (Nortantis official sample #3) —
 * sepia land with subtle relief shading, official coast shading bands inside and a
 * soft ocean shade outside, clean thin ink coastline. Continents and islets share it.
 * Main exports: drawLandmass, LandmassShape.
 */
import { type LandCellModel, pointInPolygon, type WorldPoint } from "@breadcrumb/plugin-map";
import { Container, Graphics } from "pixi.js";
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

function coastLoopsWithoutLakes(landmass: LandmassShape): WorldPoint[][] {
  const outerLoop = landmass.coastLoops.at(0) ?? [];
  return landmass.coastLoops.filter((loop) => loop === outerLoop || !isLake(loop, outerLoop));
}

/**
 * Nortantis coast shading: soft darkened bands just inside the shoreline, widest first so
 * the passes stack near the coast. Drawn as centered strokes double the band width, then
 * masked to the land shape — the sea half is clipped away and exactly the inner band
 * remains. Same picture as a polygon inset, but strokes are cheap where polygon offsetting
 * on noisy fractal coastlines took seconds per island (the old 12s palace open).
 */
function buildCoastShading(landLoops: readonly WorldPoint[][]): Container {
  const shading = new Graphics();
  for (const [inset, alpha] of [
    [11, 0.05],
    [5, 0.06],
  ] as const) {
    for (const loop of landLoops) {
      shading
        .poly([...loop], true)
        .stroke({ width: inset * 2, color: mapTheme.inkSoft, alpha, join: "round" });
    }
  }
  const landMask = new Graphics();
  for (const loop of landLoops) {
    landMask.poly([...loop], true).fill({ color: 0xffffff });
  }
  shading.mask = landMask;
  const layer = new Container();
  layer.addChild(landMask, shading);
  return layer;
}

function drawLandFill(graphics: Graphics, landLoops: readonly WorldPoint[][]): void {
  for (const loop of landLoops) {
    graphics.poly([...loop], true).fill({ color: mapTheme.landFill });
  }
}

function drawRelief(graphics: Graphics, landmass: LandmassShape): void {
  // Subtle sepia relief so highlands read darker, as in the Laham interior texture.
  for (const cell of landmass.landCells) {
    const alpha = 0.02 + 0.1 * cell.height01;
    graphics.poly(cell.polygon, true).fill({ color: RELIEF_SHADE, alpha });
  }
}

function drawLakesAndCoast(graphics: Graphics, landmass: LandmassShape): void {
  const outerLoop = landmass.coastLoops.at(0) ?? [];
  for (const loop of landmass.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) {
      graphics.poly([...loop], true).fill({ color: mapTheme.parchment });
    }
  }
  for (const loop of landmass.coastLoops) {
    // Official ocean shading: one soft wide shade outside, then the clean ink line.
    graphics
      .poly([...loop], true)
      .stroke({ width: 9, color: mapTheme.inkSoft, alpha: 0.08, join: "round" });
    graphics
      .poly([...loop], true)
      .stroke({ width: 1.3, color: mapTheme.ink, alpha: 0.95, join: "round" });
  }
}

export function drawLandmass(landmass: LandmassShape): Container {
  const landLoops = coastLoopsWithoutLakes(landmass);
  const base = new Graphics();
  drawLandFill(base, landLoops);
  // Relief lies over the shading bands, as the original instruction order painted it.
  const top = new Graphics();
  drawRelief(top, landmass);
  drawLakesAndCoast(top, landmass);
  const container = new Container();
  container.addChild(base, buildCoastShading(landLoops), top);
  return container;
}
