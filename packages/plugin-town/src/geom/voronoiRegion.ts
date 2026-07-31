/**
 * Purpose: building blocks of the bespoke Delaunay/Voronoi structure — circumcircle
 * triangles and seed-owned regions sorted by angle around the seed.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Voronoi.hx.
 * Main exports: Triangle, Region.
 */

import { sign } from "../utils/mathUtils";
import { Point } from "./point";

export class Triangle {
  readonly p1: Point;
  readonly p2: Point;
  readonly p3: Point;

  /** Circumcenter. */
  readonly c: Point;
  /** Circumradius. */
  readonly r: number;

  constructor(p1: Point, p2: Point, p3: Point) {
    const s =
      (p2.x - p1.x) * (p2.y + p1.y) + (p3.x - p2.x) * (p3.y + p2.y) + (p1.x - p3.x) * (p1.y + p3.y);
    this.p1 = p1;
    // CCW
    this.p2 = s > 0 ? p2 : p3;
    this.p3 = s > 0 ? p3 : p2;

    const x1 = (p1.x + p2.x) / 2;
    const y1 = (p1.y + p2.y) / 2;
    const x2 = (p2.x + p3.x) / 2;
    const y2 = (p2.y + p3.y) / 2;

    const dx2 = p2.y - p3.y;
    const dy2 = p3.x - p2.x;

    const tg1 = (p2.x - p1.x) / (p1.y - p2.y);
    const t2 = (y1 - y2 - (x1 - x2) * tg1) / (dy2 - dx2 * tg1);

    this.c = new Point(x2 + dx2 * t2, y2 + dy2 * t2);
    this.r = Point.distance(this.c, p1);
  }

  hasEdge(a: Point, b: Point): boolean {
    return (
      (this.p1 === a && this.p2 === b) ||
      (this.p2 === a && this.p3 === b) ||
      (this.p3 === a && this.p1 === b)
    );
  }
}

export class Region {
  seed: Point;
  vertices: Triangle[];

  constructor(seed: Point) {
    this.seed = seed;
    this.vertices = [];
  }

  sortVertices(): Region {
    this.vertices.sort((v1, v2) => this.compareAngles(v1, v2));
    return this;
  }

  center(): Point {
    const c = new Point();
    for (const v of this.vertices) {
      c.addEq(v.c);
    }
    c.scaleEq(1 / this.vertices.length);
    return c;
  }

  borders(r: Region): boolean {
    const len1 = this.vertices.length;
    const len2 = r.vertices.length;
    for (let i = 0; i < len1; i++) {
      const triangle = this.vertices[i];
      if (triangle === undefined) {
        continue;
      }
      const j = r.vertices.indexOf(triangle);
      if (j !== -1) {
        return this.vertices[(i + 1) % len1] === r.vertices[(j + len2 - 1) % len2];
      }
    }
    return false;
  }

  /** Clockwise angular order of triangle circumcenters around the seed. */
  private compareAngles(v1: Triangle, v2: Triangle): number {
    const x1 = v1.c.x - this.seed.x;
    const y1 = v1.c.y - this.seed.y;
    const x2 = v2.c.x - this.seed.x;
    const y2 = v2.c.y - this.seed.y;

    if (x1 >= 0 && x2 < 0) {
      return 1;
    }
    if (x2 >= 0 && x1 < 0) {
      return -1;
    }
    if (x1 === 0 && x2 === 0) {
      return y2 > y1 ? 1 : -1;
    }

    return sign(x2 * y1 - x1 * y2);
  }
}
