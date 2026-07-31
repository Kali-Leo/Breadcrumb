/**
 * Purpose: street-width constants and building-subdivision helpers shared by all wards
 * (static members of Ward.hx, split out to keep ward.ts within the file-size limit).
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/towngenerator/wards/Ward.hx.
 * Main exports: MAIN_STREET, REGULAR_STREET, ALLEY, createAlleys, createOrthoBuilding.
 */

import { bisect } from "../building/cutter";
import { interpolate, scalar } from "../geom/geomUtils";
import { Point } from "../geom/point";
import type { Polygon } from "../geom/polygon";
import { townRandom } from "../utils/townRandom";

export const MAIN_STREET = 2.0;
export const REGULAR_STREET = 1.0;
export const ALLEY = 0.6;

/** Recursively bisects a block into building lots, keeping lots roughly rectangular. */
export function createAlleys(
  p: Polygon,
  minSq: number,
  gridChaos: number,
  sizeChaos: number,
  emptyProb = 0.04,
  split = true,
): Polygon[] {
  // Looking for the longest edge to cut it
  // (forEdge unrolled so control-flow analysis tracks the assignment of v)
  let v: Point | null = null;
  let length = -1.0;
  for (let i = 0; i < p.length; i++) {
    const p0 = p.at(i);
    const p1 = p.at((i + 1) % p.length);
    const len = Point.distance(p0, p1);
    if (len > length) {
      length = len;
      v = p0;
    }
  }
  if (v === null) {
    throw new Error("createAlleys() on a polygon without edges");
  }

  const spread = 0.8 * gridChaos;
  const ratio = (1 - spread) / 2 + townRandom.float() * spread;

  // Trying to keep buildings rectangular even in chaotic wards
  const angleSpread = (Math.PI / 6) * gridChaos * (p.square < minSq * 4 ? 0.0 : 1);
  const b = (townRandom.float() - 0.5) * angleSpread;

  const halves = bisect(p, v, ratio, b, split ? ALLEY : 0.0);

  let buildings: Polygon[] = [];
  for (const half of halves) {
    if (half.square < minSq * 2 ** (4 * sizeChaos * (townRandom.float() - 0.5))) {
      if (!townRandom.bool(emptyProb)) {
        buildings.push(half);
      }
    } else {
      buildings = buildings.concat(
        createAlleys(
          half,
          minSq,
          gridChaos,
          sizeChaos,
          emptyProb,
          half.square > minSq / (townRandom.float() * townRandom.float()),
        ),
      );
    }
  }

  return buildings;
}

/** Returns the first vertex of the longest edge of the polygon. */
function findLongestEdge(poly: Polygon): Point {
  return poly.min((v) => -poly.vector(v).length);
}

/** Slices a block into axis-aligned building lots along its two dominant directions. */
export function createOrthoBuilding(poly: Polygon, minBlockSq: number, fill: number): Polygon[] {
  const slice = (piece: Polygon, c1: Point, c2: Point): Polygon[] => {
    const v0 = findLongestEdge(piece);
    const v1 = piece.next(v0);
    const v = v1.subtract(v0);

    const ratio = 0.4 + townRandom.float() * 0.2;
    const p1 = interpolate(v0, v1, ratio);

    const c =
      Math.abs(scalar(v.x, v.y, c1.x, c1.y)) < Math.abs(scalar(v.x, v.y, c2.x, c2.y)) ? c1 : c2;

    const halves = piece.cut(p1, p1.add(c));
    let buildings: Polygon[] = [];
    for (const half of halves) {
      if (half.square < minBlockSq * 2 ** (townRandom.normal() * 2 - 1)) {
        if (townRandom.bool(fill)) {
          buildings.push(half);
        }
      } else {
        buildings = buildings.concat(slice(half, c1, c2));
      }
    }
    return buildings;
  };

  if (poly.square < minBlockSq) {
    return [poly];
  }
  const c1 = poly.vector(findLongestEdge(poly));
  const c2 = c1.rotate90();
  while (true) {
    const blocks = slice(poly, c1, c2);
    if (blocks.length > 0) {
      return blocks;
    }
  }
}
