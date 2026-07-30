/**
 * Purpose: hand-drawn-ink primitives shared by the map renderers — dashed polylines,
 * house and hill glyphs, coastal stipple rows.
 * Main exports: strokeDashedPath, drawHouseCluster, drawHillGlyph, drawCoastStipples.
 */
import type { WorldPoint } from "@breadcrumb/plugin-map";
import type { Graphics } from "pixi.js";
import { mapTheme } from "./mapTheme";

export interface InkStroke {
  width: number;
  color: number;
  alpha?: number;
  cap?: "round";
  join?: "round";
}

export function strokeDashedPath(
  graphics: Graphics,
  points: readonly WorldPoint[],
  dashLength: number,
  gapLength: number,
  style: InkStroke,
): void {
  let drawing = true;
  let remaining = dashLength;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (a === undefined || b === undefined) continue;
    const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
    if (segmentLength < 1e-6) continue;
    let travelled = 0;
    while (travelled < segmentLength - 1e-6) {
      const step = Math.min(remaining, segmentLength - travelled);
      if (drawing) {
        const t0 = travelled / segmentLength;
        const t1 = (travelled + step) / segmentLength;
        graphics.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
        graphics.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
      travelled += step;
      remaining -= step;
      if (remaining <= 1e-6) {
        drawing = !drawing;
        remaining = drawing ? dashLength : gapLength;
      }
    }
  }
  graphics.stroke(style);
}

const HOUSE_OFFSETS: readonly (readonly WorldPoint[])[] = [
  [{ x: 0, y: 0 }],
  [
    { x: -5, y: 1 },
    { x: 5, y: -1 },
  ],
  [
    { x: -6, y: 2 },
    { x: 6, y: 1 },
    { x: 0, y: -5 },
  ],
  [
    { x: -7, y: 2 },
    { x: 7, y: 1 },
    { x: -1, y: -6 },
    { x: 2, y: 6 },
  ],
];

function drawHouse(graphics: Graphics, x: number, y: number): void {
  graphics.rect(x - 3, y - 2, 6, 4.5);
  graphics.moveTo(x - 3.8, y - 2);
  graphics.lineTo(x, y - 5.2);
  graphics.lineTo(x + 3.8, y - 2);
}

/** A settlement of `tier` little houses around the village anchor. */
export function drawHouseCluster(graphics: Graphics, center: WorldPoint, tier: number): void {
  const offsets = HOUSE_OFFSETS[Math.min(Math.max(tier, 1), 4) - 1] ?? [];
  for (const offset of offsets) {
    drawHouse(graphics, center.x + offset.x, center.y + offset.y);
  }
  graphics.stroke({ width: 1.3, color: mapTheme.ink, alpha: 0.9, join: "round" });
}

/** Classic cartographic caret hill with a short shading stroke. */
export function drawHillGlyph(graphics: Graphics, position: WorldPoint): void {
  const { x, y } = position;
  graphics.moveTo(x - 7, y + 3.5);
  graphics.quadraticCurveTo(x - 2, y - 5.5, x, y - 5.5);
  graphics.quadraticCurveTo(x + 2, y - 5.5, x + 7, y + 3.5);
  graphics.moveTo(x + 1.5, y - 3.5);
  graphics.lineTo(x + 4, y + 0.5);
  graphics.stroke({ width: 1.4, color: mapTheme.ink, alpha: 0.75, cap: "round" });
}

/** Tall double-stroke peak with a hatched right flank — the high country. */
export function drawMountainGlyph(graphics: Graphics, position: WorldPoint): void {
  const { x, y } = position;
  graphics.moveTo(x - 10, y + 5);
  graphics.lineTo(x, y - 9);
  graphics.lineTo(x + 10, y + 5);
  graphics.moveTo(x + 1.5, y - 6);
  graphics.lineTo(x + 5.5, y + 0.5);
  graphics.moveTo(x + 4, y - 2.5);
  graphics.lineTo(x + 7, y + 2.5);
  graphics.stroke({ width: 1.7, color: mapTheme.ink, alpha: 0.85, join: "round", cap: "round" });
}

/** Little round tree on a trunk for the lowlands. */
export function drawTreeGlyph(graphics: Graphics, position: WorldPoint, size = 1): void {
  const { x, y } = position;
  graphics.circle(x, y - 4 * size, 3.1 * size);
  graphics.stroke({ width: 1.2, color: mapTheme.ink, alpha: 0.6 });
  graphics.moveTo(x, y - 0.9 * size);
  graphics.lineTo(x, y + 3 * size);
  graphics.stroke({ width: 1.2, color: mapTheme.ink, alpha: 0.6, cap: "round" });
}

/** Two soft bumps — a distant sea wave. */
export function drawWaveGlyph(graphics: Graphics, position: WorldPoint): void {
  const { x, y } = position;
  graphics.moveTo(x - 6, y);
  graphics.quadraticCurveTo(x - 3, y - 3, x, y);
  graphics.quadraticCurveTo(x + 3, y - 3, x + 6, y);
  graphics.stroke({ width: 1, color: mapTheme.inkSoft, alpha: 0.22, cap: "round" });
}

/** Two rows of fading dots on the seaward side of a coast loop. */
export function drawCoastStipples(
  graphics: Graphics,
  loop: readonly WorldPoint[],
  islandCenter: WorldPoint,
): void {
  for (let index = 0; index < loop.length; index += 3) {
    const previous = loop[(index - 1 + loop.length) % loop.length];
    const point = loop[index];
    const next = loop[(index + 1) % loop.length];
    if (previous === undefined || point === undefined || next === undefined) continue;
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const length = Math.hypot(tangentX, tangentY);
    if (length < 1e-6) continue;
    let normalX = -tangentY / length;
    let normalY = tangentX / length;
    // Point the normal away from the island so dots land in the sea.
    if (normalX * (point.x - islandCenter.x) + normalY * (point.y - islandCenter.y) < 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
    graphics.circle(point.x + normalX * 5, point.y + normalY * 5, 0.9);
    graphics.fill({ color: mapTheme.inkSoft, alpha: 0.35 });
    graphics.circle(point.x + normalX * 9.5, point.y + normalY * 9.5, 0.7);
    graphics.fill({ color: mapTheme.inkSoft, alpha: 0.18 });
  }
}
