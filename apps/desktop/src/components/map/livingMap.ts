/**
 * Purpose: the map's Marauder's-map life — ink fade-in for newly learned places,
 * marching footprint dashes along the session trail, and a place-position index.
 * Main exports: buildPlacePositions, drawFootprintTrail, RevealTarget, applyReveals.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/plugin-map";
import type { Container, Graphics } from "pixi.js";
import { mapTheme } from "./mapTheme";

/** Where every knowledge node lives on the chart (island/kingdom/village/point). */
export function buildPlacePositions(world: WorldModel): Map<string, WorldPoint> {
  const positions = new Map<string, WorldPoint>();
  for (const island of world.islands) {
    positions.set(island.nodeId, island.center);
    for (const kingdom of island.kingdoms) {
      positions.set(kingdom.nodeId, kingdom.labelPosition);
      for (const village of kingdom.villages) {
        positions.set(village.nodeId, village.position);
        for (const point of village.points) {
          positions.set(point.nodeId, point.position);
        }
      }
    }
  }
  return positions;
}

/** Marching dashes along the day's walk — phase advances each frame. */
export function drawFootprintTrail(
  graphics: Graphics,
  path: readonly WorldPoint[],
  phase: number,
): void {
  graphics.clear();
  if (path.length < 2) return;
  const dashLength = 5;
  const gapLength = 8;
  const cycle = dashLength + gapLength;
  let drawing = true;
  let remaining = dashLength - (phase % cycle);
  if (remaining <= 0) {
    drawing = false;
    remaining += gapLength;
  }
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
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
  graphics.stroke({ width: 2, color: mapTheme.ink, alpha: 0.45, cap: "round" });
}

export interface RevealTarget {
  object: Container;
  /** Seconds until this object starts appearing (stagger). */
  delay: number;
  elapsed: number;
}

/** Ink fade-in with a small rise; returns targets still animating. */
export function applyReveals(targets: RevealTarget[], deltaSeconds: number): RevealTarget[] {
  const remaining: RevealTarget[] = [];
  for (const target of targets) {
    target.elapsed += deltaSeconds;
    const t = Math.min(Math.max((target.elapsed - target.delay) / 1.1, 0), 1);
    const eased = t * t * (3 - 2 * t);
    target.object.alpha = eased;
    if (t < 1) remaining.push(target);
  }
  return remaining;
}
