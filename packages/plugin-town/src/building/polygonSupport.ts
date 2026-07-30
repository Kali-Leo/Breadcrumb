/**
 * Purpose: local ports of Polygon.hx members that the shared geom Polygon contract does not
 * expose (centroid, convexity, vertex smoothing, interpolation weights, transforms, factories).
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: polygonCentroid, polygonIsConvex, smoothPolygonVertex, polygonInterpolate,
 * rotatePolygon, offsetPolygon, rectPolygon, regularPolygon, circlePolygon, polygonIndexOfFrom.
 */

import { cross } from "../geom/geomUtils";
import { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";

/** Polygon.centroid: exact area-weighted centroid (as opposed to the vertex-average center). */
export function polygonCentroid(poly: Polygon): Point {
  let x = 0.0;
  let y = 0.0;
  let a = 0.0;
  poly.forEdge((v0, v1) => {
    const f = cross(v0.x, v0.y, v1.x, v1.y);
    a += f;
    x += (v0.x + v1.x) * f;
    y += (v0.y + v1.y) * f;
  });
  const s6 = 1 / (3 * a);
  return new Point(s6 * x, s6 * y);
}

/** Polygon.isConvexVertex: cross-product test on the two edges around the vertex. */
function polygonIsConvexVertex(poly: Polygon, v1: Point): boolean {
  const v0 = poly.prev(v1);
  const v2 = poly.next(v1);
  return cross(v1.x - v0.x, v1.y - v0.y, v2.x - v1.x, v2.y - v1.y) > 0;
}

/** Polygon.isConvex: true when every vertex is convex. */
export function polygonIsConvex(poly: Polygon): boolean {
  for (const v of poly) {
    if (!polygonIsConvexVertex(poly, v)) {
      return false;
    }
  }
  return true;
}

/** Polygon.smoothVertex: weighted average of the vertex and its two neighbours (new Point). */
export function smoothPolygonVertex(poly: Polygon, v: Point, f = 1.0): Point {
  const prev = poly.prev(v);
  const next = poly.next(v);
  return new Point(prev.x + v.x * f + next.x, prev.y + v.y * f + next.y).scale(1 / (2 + f));
}

/** Polygon.interpolate: inverse-distance weights of every vertex relative to a point. */
export function polygonInterpolate(poly: Polygon, p: Point): number[] {
  let sum = 0.0;
  const inverseDistances: number[] = [];
  for (const v of poly) {
    const d = 1 / Point.distance(v, p);
    sum += d;
    inverseDistances.push(d);
  }
  return inverseDistances.map((d) => d / sum);
}

/** Polygon.rotate: rotates all vertices around the origin, in place. */
export function rotatePolygon(poly: Polygon, angle: number): void {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  for (const v of poly) {
    const vx = v.x * cosA - v.y * sinA;
    const vy = v.y * cosA + v.x * sinA;
    v.setTo(vx, vy);
  }
}

/** Polygon.offset: translates all vertices by the given point, in place. */
export function offsetPolygon(poly: Polygon, by: Point): void {
  const dx = by.x;
  const dy = by.y;
  for (const v of poly) {
    v.offset(dx, dy);
  }
}

/** Polygon.rect: axis-aligned rectangle centered on the origin. */
export function rectPolygon(w = 1.0, h = 1.0): Polygon {
  return new Polygon([
    new Point(-w / 2, -h / 2),
    new Point(w / 2, -h / 2),
    new Point(w / 2, h / 2),
    new Point(-w / 2, h / 2),
  ]);
}

/** Polygon.regular: regular n-gon of the given radius centered on the origin. */
export function regularPolygon(n = 8, r = 1.0): Polygon {
  const vertices: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    vertices.push(new Point(r * Math.cos(a), r * Math.sin(a)));
  }
  return new Polygon(vertices);
}

/** Polygon.circle: 16-gon approximation of a circle. */
export function circlePolygon(r = 1.0): Polygon {
  return regularPolygon(16, r);
}

/** Array.indexOf with a fromIndex, over polygon vertices (identity comparison). */
export function polygonIndexOfFrom(poly: Polygon, v: Point, fromIndex: number): number {
  for (let i = fromIndex; i < poly.length; i++) {
    if (poly.at(i) === v) {
      return i;
    }
  }
  return -1;
}
