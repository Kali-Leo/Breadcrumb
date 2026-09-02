/**
 * Purpose: dashed ink polylines — the standard cartographic dashed-boundary stroke
 * (region frontiers, session footprints), as seen in the Laham reference.
 * Main exports: InkStroke, strokeDashedPath.
 */
import type { WorldPoint } from "@breadcrumb/feature-map";
import type { Graphics } from "pixi.js";

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
