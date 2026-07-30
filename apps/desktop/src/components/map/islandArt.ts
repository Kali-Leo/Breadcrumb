/**
 * Purpose: one island's base terrain art — true buffered water rings, land fill with
 * per-cell relief shading, kingdom tints, lakes, hand-drawn (rough) coast ink and
 * tapering rivers. Relief glyphs and hatching live in reliefArt.
 * Main exports: drawIslandTerrain.
 */
import {
  hashStringToSeed,
  type IslandModel,
  pointInPolygon,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Graphics } from "pixi.js";
import Offset from "polygon-offset";
import { mapTheme } from "./mapTheme";
import { strokeRoughPolygon } from "./roughToPixi";

const RELIEF_SHADE = 0xb0996e;
const WATER_RING_DISTANCES = [6, 13, 22] as const;
const WATER_RING_ALPHAS = [0.28, 0.16, 0.09] as const;

/** Coast loops after the first are lakes when they sit inside the main landmass. */
function isLake(loop: readonly WorldPoint[], outerLoop: readonly WorldPoint[]): boolean {
  const probe = loop.at(0);
  return probe !== undefined && pointInPolygon(probe, outerLoop);
}

/** True equidistant rings around a coast via polygon buffering. */
function drawWaterRings(graphics: Graphics, loop: readonly WorldPoint[]): void {
  const ringSource = loop.map((point) => [point.x, point.y] as [number, number]);
  WATER_RING_DISTANCES.forEach((distance, ringIndex) => {
    try {
      const rings = new Offset().data([ringSource]).margin(distance);
      for (const ring of rings) {
        graphics.poly(
          ring.map(([x, y]) => ({ x, y })),
          true,
        );
        graphics.stroke({
          width: 1 - ringIndex * 0.15,
          color: mapTheme.inkSoft,
          alpha: WATER_RING_ALPHAS[ringIndex] ?? 0.1,
        });
      }
    } catch {
      // Degenerate loop — fall back to a soft halo instead of rings.
      graphics.poly([...loop], true);
      graphics.stroke({ width: distance, color: mapTheme.inkSoft, alpha: 0.05, join: "round" });
    }
  });
}

/**
 * Nortantis-style coast shading — a darkened band just inside the shoreline.
 * Tints the whole island, then repaints the interior back, leaving only the band
 * (widest band first so the passes stack near the coast).
 */
function drawCoastShading(graphics: Graphics, loop: readonly WorldPoint[]): void {
  const ringSource = loop.map((point) => [point.x, point.y] as [number, number]);
  for (const [inset, alpha] of [
    [11, 0.04],
    [5, 0.055],
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
  // Relief shading: higher cells get a deeper warm tone; cells are small enough
  // that seams read as engraving texture, so fills only.
  for (const cell of island.landCells) {
    const alpha = 0.03 + 0.14 * cell.height01;
    graphics.poly(cell.polygon, true).fill({ color: RELIEF_SHADE, alpha });
  }
}

function drawKingdomTints(graphics: Graphics, island: IslandModel): void {
  for (const kingdom of island.kingdoms) {
    const tint = mapTheme.kingdomTints[kingdom.tintIndex] ?? mapTheme.landFill;
    for (const polygon of kingdom.cellPolygons) {
      graphics.poly(polygon, true).fill({ color: tint, alpha: 0.2 });
    }
  }
}

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
        width: river.startWidth + (river.endWidth - river.startWidth) * progress,
        color: mapTheme.river,
        alpha: 0.7,
        cap: "round",
      });
    }
  }
}

function drawLakesAndCoast(graphics: Graphics, island: IslandModel): void {
  const outerLoop = island.coastLoops.at(0) ?? [];
  const seed = hashStringToSeed(island.nodeId);
  for (const loop of island.coastLoops) {
    if (loop !== outerLoop && isLake(loop, outerLoop)) {
      graphics.poly([...loop], true).fill({ color: mapTheme.parchment });
    }
  }
  for (const loop of island.coastLoops) {
    graphics
      .poly([...loop], true)
      .stroke({ width: 4.5, color: mapTheme.ink, alpha: 0.1, join: "round" });
    strokeRoughPolygon(
      graphics,
      loop,
      { seed: seed + loop.length, roughness: 1.1, bowing: 0.6 },
      { width: 1.5, color: mapTheme.ink, alpha: 0.85, join: "round", cap: "round" },
    );
  }
}

export function drawIslandTerrain(island: IslandModel): Graphics {
  const graphics = new Graphics();
  const outerLoop = island.coastLoops.at(0) ?? [];
  for (const loop of island.coastLoops) {
    if (loop === outerLoop || !isLake(loop, outerLoop)) drawWaterRings(graphics, loop);
  }
  drawLandAndShading(graphics, island);
  drawKingdomTints(graphics, island);
  drawRivers(graphics, island);
  drawLakesAndCoast(graphics, island);
  return graphics;
}
