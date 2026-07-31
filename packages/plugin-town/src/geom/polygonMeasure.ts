/**
 * Purpose: read-only polygon measures — area, perimeter, centers, bounds, convexity,
 * adjacency and inverse-distance interpolation weights.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: polygonSquare, polygonPerimeter, polygonCentroid, polygonGetBounds, Bounds.
 */

import { cross } from "./geomUtils";
import { Point } from "./point";
import type { PolygonCore } from "./polygonCore";

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** Signed area (positive for clockwise in y-down space, as in the Haxe source). */
export function polygonSquare(poly: PolygonCore): number {
  let v1 = poly.at(poly.length - 1);
  let v2 = poly.at(0);
  let s = v1.x * v2.y - v2.x * v1.y;
  for (let i = 1; i < poly.length; i++) {
    v1 = v2;
    v2 = poly.at(i);
    s += v1.x * v2.y - v2.x * v1.y;
  }
  return s * 0.5;
}

export function polygonPerimeter(poly: PolygonCore): number {
  let len = 0;
  poly.forEdge((v0, v1) => {
    len += Point.distance(v0, v1);
  });
  return len;
}

/** 1.00 for a circle, 0.79 for a square, 0.60 for a triangle. */
export function polygonCompactness(poly: PolygonCore): number {
  const p = polygonPerimeter(poly);
  return (4 * Math.PI * polygonSquare(poly)) / (p * p);
}

/** Faster approximation of the centroid (vertex average). */
export function polygonCenter(poly: PolygonCore): Point {
  const c = new Point();
  for (const v of poly) {
    c.addEq(v);
  }
  c.scaleEq(1 / poly.length);
  return c;
}

export function polygonCentroid(poly: PolygonCore): Point {
  let x = 0;
  let y = 0;
  let a = 0;
  poly.forEdge((v0, v1) => {
    const f = cross(v0.x, v0.y, v1.x, v1.y);
    a += f;
    x += (v0.x + v1.x) * f;
    y += (v0.y + v1.y) * f;
  });
  const s6 = 1 / (3 * a);
  return new Point(s6 * x, s6 * y);
}

/**
 * Preserved Haxe quirk: always returns the distance from the FIRST vertex to p
 * (the loop never updates the minimum), not the true minimal vertex distance.
 */
export function polygonDistance(poly: PolygonCore, p: Point): number {
  let v0 = poly.at(0);
  const d = Point.distance(v0, p);
  for (let i = 1; i < poly.length; i++) {
    const v1 = poly.at(i);
    const d1 = Point.distance(v1, p);
    if (d1 < d) {
      v0 = v1;
    }
  }
  return d;
}

export function polygonIsConvexVertexi(poly: PolygonCore, i: number): boolean {
  const len = poly.length;
  const v0 = poly.at((i + len - 1) % len);
  const v1 = poly.at(i);
  const v2 = poly.at((i + 1) % len);
  return cross(v1.x - v0.x, v1.y - v0.y, v2.x - v1.x, v2.y - v1.y) > 0;
}

export function polygonIsConvexVertex(poly: PolygonCore, v1: Point): boolean {
  const v0 = poly.prev(v1);
  const v2 = poly.next(v1);
  return cross(v1.x - v0.x, v1.y - v0.y, v2.x - v1.x, v2.y - v1.y) > 0;
}

export function polygonIsConvex(poly: PolygonCore): boolean {
  for (const v of poly) {
    if (!polygonIsConvexVertex(poly, v)) {
      return false;
    }
  }
  return true;
}

/** True when the polygons share an edge (same two Point references, opposite order allowed). */
export function polygonBorders(poly: PolygonCore, another: PolygonCore): boolean {
  const len1 = poly.length;
  const len2 = another.length;
  for (let i = 0; i < len1; i++) {
    const j = another.indexOf(poly.at(i));
    if (j !== -1) {
      const next = poly.at((i + 1) % len1);
      if (next === another.at((j + 1) % len2) || next === another.at((j + len2 - 1) % len2)) {
        return true;
      }
    }
  }
  return false;
}

export function polygonGetBounds(poly: PolygonCore): Bounds {
  const first = poly.at(0);
  let left = first.x;
  let right = first.x;
  let top = first.y;
  let bottom = first.y;
  for (const v of poly) {
    left = Math.min(left, v.x);
    right = Math.max(right, v.x);
    top = Math.min(top, v.y);
    bottom = Math.max(bottom, v.y);
  }
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** Inverse-distance weights of p relative to each vertex; weights sum to 1. */
export function polygonInterpolate(poly: PolygonCore, p: Point): number[] {
  let sum = 0;
  const dd = poly.vertices.map((v) => {
    const d = 1 / Point.distance(v, p);
    sum += d;
    return d;
  });
  return dd.map((d) => d / sum);
}
