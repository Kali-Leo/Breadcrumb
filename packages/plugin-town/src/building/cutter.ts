/**
 * Purpose: polygon cutting strategies for ward geometry — bisection, radial and semi-radial
 * sectors, and ring peeling along the perimeter.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Cutter.hx.
 * Main exports: bisect, radial, semiRadial, ring, Cutter.
 */

import { interpolate } from "../geom/geomUtils";
import { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";
import { itemAt } from "./arraySupport";

/** Cuts the polygon across the edge starting at vertex, at the given ratio and tilt angle. */
export function bisect(
  poly: Polygon,
  vertex: Point,
  ratio = 0.5,
  angle = 0.0,
  gap = 0.0,
): Polygon[] {
  const next = poly.next(vertex);

  const p1 = interpolate(vertex, next, ratio);
  const d = next.subtract(vertex);

  const cosB = Math.cos(angle);
  const sinB = Math.sin(angle);
  const vx = d.x * cosB - d.y * sinB;
  const vy = d.y * cosB + d.x * sinB;
  const p2 = new Point(p1.x - vy, p1.y + vx);

  return poly.cut(p1, p2, gap);
}

/** Slices the polygon into triangular sectors around a center (centroid by default). */
export function radial(poly: Polygon, center: Point | null = null, gap = 0.0): Polygon[] {
  const c = center !== null ? center : poly.centroid;

  const sectors: Polygon[] = [];
  poly.forEdge((v0, v1) => {
    let sector = new Polygon([c, v0, v1]);
    if (gap > 0) {
      sector = sector.shrink([gap / 2, 0, gap / 2]);
    }
    sectors.push(sector);
  });
  return sectors;
}

/** Like radial, but centered on the vertex closest to the centroid, skipping its own edges. */
export function semiRadial(poly: Polygon, center: Point | null = null, gap = 0.0): Polygon[] {
  let c: Point;
  if (center === null) {
    const centroid = poly.centroid;
    c = poly.min((v) => Point.distance(v, centroid));
  } else {
    c = center;
  }

  const halfGap = gap / 2;

  const sectors: Polygon[] = [];
  poly.forEdge((v0, v1) => {
    if (v0 !== c && v1 !== c) {
      let sector = new Polygon([c, v0, v1]);
      if (halfGap > 0) {
        const d = [
          poly.findEdge(c, v0) === -1 ? halfGap : 0,
          0,
          poly.findEdge(v1, c) === -1 ? halfGap : 0,
        ];
        sector = sector.shrink(d);
      }
      sectors.push(sector);
    }
  });
  return sectors;
}

interface RingSlice {
  p1: Point;
  p2: Point;
  len: number;
}

/** Peels a ring of the given thickness off the polygon, shortest edges sliced first. */
export function ring(poly: Polygon, thickness: number): Polygon[] {
  const slices: RingSlice[] = [];
  poly.forEdge((v1, v2) => {
    const v = v2.subtract(v1);
    const n = v.rotate90().norm(thickness);
    slices.push({ p1: v1.add(n), p2: v2.add(n), len: v.length });
  });

  // Short sides should be sliced first
  slices.sort((s1, s2) => s1.len - s2.len);

  const peel: Polygon[] = [];

  let p = poly;
  for (const slice of slices) {
    const halves = p.cut(slice.p1, slice.p2);
    p = itemAt(halves, 0);
    if (halves.length === 2) {
      peel.push(itemAt(halves, 1));
    }
  }

  return peel;
}

/** Namespace-style grouping mirroring the original static Cutter class. */
export const Cutter = { bisect, radial, semiRadial, ring };
