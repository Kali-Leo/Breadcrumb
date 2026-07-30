/**
 * Purpose: city patch — one polygonal cell of the Voronoi partition, carrying its assigned
 * ward and city/wall membership flags; its vertices are shared by reference with neighbours.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Patch.hx.
 * Main exports: Patch, PatchRegion.
 */

import type { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";
import type { Ward } from "../wards/ward";

/** Structural view of a Voronoi region: its vertices are triangles with a circumcenter c. */
export interface PatchRegion {
  vertices: ReadonlyArray<{ c: Point }>;
}

export class Patch {
  shape: Polygon;
  ward: Ward | null = null;

  withinWalls = false;
  withinCity = false;

  constructor(vertices: Point[]) {
    this.shape = new Polygon(vertices);
  }

  static fromRegion(region: PatchRegion): Patch {
    return new Patch(region.vertices.map((triangle) => triangle.c));
  }
}
