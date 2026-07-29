/**
 * Purpose: islands — every knowledge place stands on land. Irregular ink coastline,
 * inner shore line, beach stipples, and ripple arcs in the surrounding sea
 * (from Leo's 岛屿参考: cartoon line-art islands).
 * Main exports: drawIsland, islandRadius.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import { INK, INK_FAINT } from "./palette";
import { hashString, seededRandom } from "./prng";

export function islandRadius(place: MapPlace): number {
  return place.radius * 1.9;
}

/** Deterministic wobbly coastline points around a center. */
function coastlinePoints(
  seed: number,
  radius: number,
  pointCount: number,
  wobble: number,
): { x: number; y: number }[] {
  const random = seededRandom(seed);
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < pointCount; index++) {
    const angle = (index / pointCount) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + random() * wobble);
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return points;
}

function traceClosedCurve(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  points: readonly { x: number; y: number }[],
  scale: number,
): void {
  context.beginPath();
  for (let index = 0; index <= points.length; index++) {
    const current = points[index % points.length];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    const midX = x + ((current.x + next.x) / 2) * scale;
    const midY = y + ((current.y + next.y) / 2) * scale;
    if (index === 0) context.moveTo(midX, midY);
    else context.quadraticCurveTo(x + current.x * scale, y + current.y * scale, midX, midY);
  }
  context.closePath();
}

export function drawIsland(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
): void {
  const seed = hashString(place.id + place.name);
  const radius = islandRadius(place);
  const coast = coastlinePoints(seed, radius, 14, 0.5);

  // Ripple arcs in the sea around the island (two broken rings).
  const rippleRandom = seededRandom(seed + 7);
  context.strokeStyle = INK_FAINT;
  context.lineWidth = Math.max(0.7, 1 * scale);
  for (let ring = 0; ring < 2; ring++) {
    const rippleRadius = radius * (1.22 + ring * 0.24);
    const arcCount = 7 + ring * 2;
    for (let arc = 0; arc < arcCount; arc++) {
      const start = rippleRandom() * Math.PI * 2;
      context.beginPath();
      context.arc(x, y, rippleRadius * scale, start, start + 0.35 + rippleRandom() * 0.3);
      context.stroke();
    }
  }

  // Landmass: paper-sand fill with a firm ink coastline.
  traceClosedCurve(context, x, y, coast, scale);
  context.fillStyle = "#efe3c4";
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = Math.max(1, 1.6 * scale);
  context.stroke();

  // Inner shore line echoing the coast.
  traceClosedCurve(context, x, y, coastlinePoints(seed + 3, radius * 0.86, 14, 0.42), scale);
  context.strokeStyle = INK_FAINT;
  context.lineWidth = Math.max(0.6, 0.9 * scale);
  context.stroke();

  // Beach stipples between shore lines.
  const stippleRandom = seededRandom(seed + 11);
  context.fillStyle = INK_FAINT;
  const stippleCount = Math.round(radius * 0.9);
  for (let dot = 0; dot < stippleCount; dot++) {
    const angle = stippleRandom() * Math.PI * 2;
    const distance = radius * (0.86 + stippleRandom() * 0.1);
    context.beginPath();
    context.arc(
      x + Math.cos(angle) * distance * scale,
      y + Math.sin(angle) * distance * scale,
      Math.max(0.5, 0.7 * scale),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}
