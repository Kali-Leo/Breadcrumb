/**
 * Purpose: small ink primitives still drawn by code — dashed polylines (frontiers,
 * future footprints) and sea wave squiggles. Relief/settlement art now comes from the
 * hand-drawn Nortantis stamps (see mapArtAssets).
 * Main exports: InkStroke, strokeDashedPath, drawWaveGlyph.
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

/** Two soft bumps — a distant sea wave. */
export function drawWaveGlyph(graphics: Graphics, position: WorldPoint): void {
  const { x, y } = position;
  graphics.moveTo(x - 6, y);
  graphics.quadraticCurveTo(x - 3, y - 3, x, y);
  graphics.quadraticCurveTo(x + 3, y - 3, x + 6, y);
  graphics.stroke({ width: 1, color: mapTheme.inkSoft, alpha: 0.22, cap: "round" });
}
