/**
 * Purpose: cut-based polygon operations — straight-line cut into two halves, single-edge
 * peel, and shrink (inset every edge via successive cuts).
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: cutPolygon, peelPolygon, shrinkPolygon.
 */

import { cross, intersectLines } from "./geomUtils";
import type { Point } from "./point";
import { Polygon } from "./polygon";
import type { PolygonCore } from "./polygonCore";

/** Cuts the polygon by the line p1-p2 into two halves (optionally separated by a gap). */
export function cutPolygon(poly: PolygonCore, p1: Point, p2: Point, gap = 0): Polygon[] {
  const x1 = p1.x;
  const y1 = p1.y;
  const dx1 = p2.x - x1;
  const dy1 = p2.y - y1;

  const len = poly.length;
  let edge1 = 0;
  let ratio1 = 0;
  let edge2 = 0;
  let ratio2 = 0;
  let count = 0;

  for (let i = 0; i < len; i++) {
    const v0 = poly.at(i);
    const v1 = poly.at((i + 1) % len);

    const x2 = v0.x;
    const y2 = v0.y;
    const dx2 = v1.x - x2;
    const dy2 = v1.y - y2;

    const t = intersectLines(x1, y1, dx1, dy1, x2, y2, dx2, dy2);
    if (t !== null && t.y >= 0 && t.y <= 1) {
      if (count === 0) {
        edge1 = i;
        ratio1 = t.x;
      } else if (count === 1) {
        edge2 = i;
        ratio2 = t.x;
      }
      count++;
    }
  }

  if (count === 2) {
    const point1 = p1.add(p2.subtract(p1).scale(ratio1));
    const point2 = p1.add(p2.subtract(p1).scale(ratio2));

    let half1 = new Polygon(poly.vertices.slice(edge1 + 1, edge2 + 1));
    half1.unshift(point1);
    half1.push(point2);

    let half2 = new Polygon(
      poly.vertices.slice(edge2 + 1).concat(poly.vertices.slice(0, edge1 + 1)),
    );
    half2.unshift(point2);
    half2.push(point1);

    if (gap > 0) {
      half1 = peelPolygon(half1, point2, gap / 2);
      half2 = peelPolygon(half2, point1, gap / 2);
    }

    const v = poly.vectori(edge1);
    return cross(dx1, dy1, v.x, v.y) > 0 ? [half1, half2] : [half2, half1];
  }
  return [new Polygon(poly.vertices)];
}

/** Cuts a peel of width d along the edge starting at vertex v1, keeping the main part. */
export function peelPolygon(poly: PolygonCore, v1: Point, d: number): Polygon {
  const i1 = poly.indexOf(v1);
  const i2 = i1 === poly.length - 1 ? 0 : i1 + 1;
  const v2 = poly.at(i2);

  const v = v2.subtract(v1);
  const n = v.rotate90().norm(d);

  return cutPolygon(poly, v1.add(n), v2.add(n), 0)[0] ?? new Polygon(poly.vertices);
}

/** Insets every edge by its distance in d via successive cuts; convex-friendly. */
export function shrinkPolygon(poly: Polygon, d: readonly number[]): Polygon {
  let q = new Polygon(poly.vertices);
  let edgeIndex = 0;
  poly.forEdge((v1, v2) => {
    const dd = d[edgeIndex] ?? 0;
    edgeIndex++;
    if (dd > 0) {
      const v = v2.subtract(v1);
      const n = v.rotate90().norm(dd);
      q = cutPolygon(q, v1.add(n), v2.add(n), 0)[0] ?? q;
    }
  });
  return q;
}
