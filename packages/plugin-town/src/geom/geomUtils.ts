/**
 * Purpose: low-level line/vector helpers used by polygon operations and Voronoi construction.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/GeomUtils.hx.
 * Main exports: intersectLines, interpolate, scalar, cross, distance2line, GeomUtils.
 */

import { Point } from "./point";

/**
 * Intersects two parametric lines; returns a Point whose x is t1 (parameter on the
 * first line) and y is t2 (parameter on the second line), or null for parallel lines.
 */
export function intersectLines(
  x1: number,
  y1: number,
  dx1: number,
  dy1: number,
  x2: number,
  y2: number,
  dx2: number,
  dy2: number,
): Point | null {
  const d = dx1 * dy2 - dy1 * dx2;
  if (d === 0) {
    return null;
  }

  const t2 = (dy1 * (x2 - x1) - dx1 * (y2 - y1)) / d;
  const t1 = dx1 !== 0 ? (x2 - x1 + dx2 * t2) / dx1 : (y2 - y1 + dy2 * t2) / dy1;

  return new Point(t1, t2);
}

/** Linear interpolation between two points. */
export function interpolate(p1: Point, p2: Point, ratio = 0.5): Point {
  const d = p2.subtract(p1);
  return new Point(p1.x + d.x * ratio, p1.y + d.y * ratio);
}

/** Dot product of two vectors given by components. */
export function scalar(x1: number, y1: number, x2: number, y2: number): number {
  return x1 * x2 + y1 * y2;
}

/** Cross product (z component) of two vectors given by components. */
export function cross(x1: number, y1: number, x2: number, y2: number): number {
  return x1 * y2 - y1 * x2;
}

/** Signed distance from point (x0, y0) to the line through (x1, y1) with direction (dx1, dy1). */
export function distance2line(
  x1: number,
  y1: number,
  dx1: number,
  dy1: number,
  x0: number,
  y0: number,
): number {
  return (
    (dx1 * y0 - dy1 * x0 + (y1 + dy1) * x1 - (x1 + dx1) * y1) / Math.sqrt(dx1 * dx1 + dy1 * dy1)
  );
}

/** Namespace-style aggregate matching Haxe call sites (GeomUtils.cross, ...). */
export const GeomUtils = {
  intersectLines,
  interpolate,
  scalar,
  cross,
  distance2line,
};
