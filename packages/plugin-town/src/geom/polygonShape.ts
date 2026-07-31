/**
 * Purpose: shape-editing polygon helpers — vertex smoothing, short-edge filtering,
 * single-edge insetting and vertex-count simplification.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: smoothPolygonVertexi, smoothVertexEqVertices, insetPolygonEdge, simplyfyPolygon.
 */

import { sign } from "../utils/mathUtils";
import { Point } from "./point";
import type { PolygonCore } from "./polygonCore";

export function smoothPolygonVertexi(poly: PolygonCore, i: number, f = 1.0): Point {
  const v = poly.at(i);
  const len = poly.length;
  const prev = poly.at((i + len - 1) % len);
  const next = poly.at((i + 1) % len);
  return new Point((prev.x + v.x * f + next.x) / (2 + f), (prev.y + v.y * f + next.y) / (2 + f));
}

export function smoothPolygonVertex(poly: PolygonCore, v: Point, f = 1.0): Point {
  const prev = poly.prev(v);
  const next = poly.next(v);
  return new Point(prev.x + v.x * f + next.x, prev.y + v.y * f + next.y).scale(1 / (2 + f));
}

/** New vertex array with every vertex smoothed towards its neighbours. */
export function smoothVertexEqVertices(poly: PolygonCore, f = 1.0): Point[] {
  const len = poly.length;
  let v1 = poly.at(len - 1);
  let v2 = poly.at(0);
  const result: Point[] = [];
  for (let i = 0; i < len; i++) {
    const v0 = v1;
    v1 = v2;
    v2 = poly.at((i + 1) % len);
    result.push(new Point((v0.x + v1.x * f + v2.x) / (2 + f), (v0.y + v1.y * f + v2.y) / (2 + f)));
  }
  return result;
}

/** Drops vertices closer than threshold to the previous kept vertex (shares Point refs). */
export function filterShortVertices(poly: PolygonCore, threshold: number): Point[] {
  let i = 1;
  let v0 = poly.at(0);
  let v1 = poly.at(1);
  const result = [v0];
  do {
    do {
      v1 = poly.at(i);
      i++;
    } while (Point.distance(v0, v1) < threshold && i < poly.length);
    v0 = v1;
    result.push(v0);
  } while (i < poly.length);

  return result;
}

/**
 * Insets one edge defined by its first vertex, replacing the edge's two vertex
 * references with new points. Not fully reliable for concave vertices (as in Haxe).
 */
export function insetPolygonEdge(poly: PolygonCore, p1: Point, d: number): void {
  const i1 = poly.indexOf(p1);
  const i0 = i1 > 0 ? i1 - 1 : poly.length - 1;
  const p0 = poly.at(i0);
  const i2 = i1 < poly.length - 1 ? i1 + 1 : 0;
  const p2 = poly.at(i2);
  const i3 = i2 < poly.length - 1 ? i2 + 1 : 0;
  const p3 = poly.at(i3);

  const v0 = p1.subtract(p0);
  const v1 = p2.subtract(p1);
  const v2 = p3.subtract(p2);

  let cos = v0.dot(v1) / v0.length / v1.length;
  let z = v0.x * v1.y - v0.y * v1.x;
  let t = d / Math.sqrt(1 - cos * cos); // sin( acos( cos ) )
  if (z > 0) {
    t = Math.min(t, v0.length * 0.99);
  } else {
    t = Math.min(t, v1.length * 0.5);
  }
  t *= sign(z);
  poly.set(i1, p1.subtract(v0.norm(t)));

  cos = v1.dot(v2) / v1.length / v2.length;
  z = v1.x * v2.y - v1.y * v2.x;
  t = d / Math.sqrt(1 - cos * cos);
  if (z > 0) {
    t = Math.min(t, v2.length * 0.99);
  } else {
    t = Math.min(t, v1.length * 0.5);
  }
  poly.set(i2, p2.add(v2.norm(t)));
}

/** Removes vertices in place until only n remain, dropping the flattest corner each pass. */
export function simplyfyPolygon(poly: PolygonCore, n: number): void {
  let len = poly.length;
  while (len > n) {
    let result = 0;
    let min = Number.POSITIVE_INFINITY;

    let b = poly.at(len - 1);
    let c = poly.at(0);
    for (let i = 0; i < len; i++) {
      const a = b;
      b = c;
      c = poly.at((i + 1) % len);
      const measure = Math.abs(a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (measure < min) {
        result = i;
        min = measure;
      }
    }

    poly.splice(result, 1);
    len--;
  }
}
