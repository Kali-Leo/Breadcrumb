/**
 * Purpose: polygon buffer operation — offsets every edge, repairs self-intersections
 * and keeps the largest resulting part.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: bufferPolygon.
 */

import { remove } from "../utils/arrayHelpers";
import { intersectLines } from "./geomUtils";
import { Point } from "./point";
import { Polygon } from "./polygon";
import type { PolygonCore } from "./polygonCore";

const DELTA = 0.000001;

/** Offsets every edge by its distance in d, then keeps the largest non-degenerate part. */
export function bufferPolygon(poly: PolygonCore, d: readonly number[]): Polygon {
  // Creating a polygon (probably invalid) with offset edges.
  const q = new Polygon();
  let edgeIndex = 0;
  poly.forEdge((v0, v1) => {
    const dd = d[edgeIndex] ?? 0;
    edgeIndex++;
    if (dd === 0) {
      q.push(v0);
      q.push(v1);
    } else {
      const v = v1.subtract(v0);
      const n = v.rotate90().norm(dd);
      q.push(v0.add(n));
      q.push(v1.add(n));
    }
  });

  // Creating a valid polygon by dealing with self-intersection: find intersections
  // of every edge with every other edge and insert the intersection point twice.
  let wasCut = false;
  let lastEdge = 0;
  do {
    wasCut = false;

    const n = q.length;
    for (let i = lastEdge; i < n - 2; i++) {
      lastEdge = i;

      const p11 = q.at(i);
      const p12 = q.at(i + 1);
      const x1 = p11.x;
      const y1 = p11.y;
      const dx1 = p12.x - x1;
      const dy1 = p12.y - y1;

      const jEnd = i > 0 ? n : n - 1;
      for (let j = i + 2; j < jEnd; j++) {
        const p21 = q.at(j);
        const p22 = j < n - 1 ? q.at(j + 1) : q.at(0);
        const x2 = p21.x;
        const y2 = p21.y;
        const dx2 = p22.x - x2;
        const dy2 = p22.y - y2;

        const hit = intersectLines(x1, y1, dx1, dy1, x2, y2, dx2, dy2);
        if (
          hit !== null &&
          hit.x > DELTA &&
          hit.x < 1 - DELTA &&
          hit.y > DELTA &&
          hit.y < 1 - DELTA
        ) {
          const pn = new Point(x1 + dx1 * hit.x, y1 + dy1 * hit.x);

          q.insert(j + 1, pn);
          q.insert(i + 1, pn);

          wasCut = true;
          break;
        }
      }
      if (wasCut) {
        break;
      }
    }
  } while (wasCut);

  // Checking every part of the polygon to pick the biggest.
  const regular: number[] = [];
  for (let i = 0; i < q.length; i++) {
    regular.push(i);
  }

  let bestPart: Polygon | null = null;
  let bestPartSq = Number.NEGATIVE_INFINITY;

  while (regular.length > 0) {
    const indices: number[] = [];
    const start = regular[0] ?? 0;
    let i = start;
    do {
      indices.push(i);
      remove(regular, i);

      const next = (i + 1) % q.length;
      const v = q.at(next);
      let next1 = q.indexOf(v);
      if (next1 === next) {
        next1 = q.lastIndexOf(v);
      }
      i = next1 === -1 ? next : next1;
    } while (i !== start);

    const part = new Polygon(indices.map((index) => q.at(index)));
    const s = part.square;
    if (s > bestPartSq) {
      bestPart = part;
      bestPartSq = s;
    }
  }

  return bestPart ?? new Polygon();
}
