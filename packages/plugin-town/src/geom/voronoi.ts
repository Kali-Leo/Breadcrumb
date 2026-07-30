/**
 * Purpose: bespoke incremental Delaunay triangulation with Voronoi region extraction,
 * Lloyd relaxation and frame handling, exactly as in the original town generator.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Voronoi.hx.
 * Main exports: Voronoi.
 */

import { contains, remove } from "../utils/arrayHelpers";
import { Point } from "./point";
import { buildVoronoi, relaxVoronoi } from "./voronoiBuild";
import { Region, Triangle } from "./voronoiRegion";

export class Voronoi {
  triangles: Triangle[];

  points: Point[];
  frame: Point[];

  private regionsDirty: boolean;
  private regionsCache: Map<Point, Region>;

  constructor(minx: number, miny: number, maxx: number, maxy: number) {
    this.triangles = [];

    const c1 = new Point(minx, miny);
    const c2 = new Point(minx, maxy);
    const c3 = new Point(maxx, miny);
    const c4 = new Point(maxx, maxy);
    this.frame = [c1, c2, c3, c4];
    this.points = [c1, c2, c3, c4];
    this.triangles.push(new Triangle(c1, c2, c3));
    this.triangles.push(new Triangle(c2, c3, c4));

    // These temporary regions will be discarded anyway (kept to match the source).
    this.regionsCache = new Map();
    for (const p of this.points) {
      this.regionsCache.set(p, this.buildRegion(p));
    }
    this.regionsDirty = false;
  }

  /** Adds a point and re-triangulates the affected (circumcircle-hit) triangles. */
  addPoint(p: Point): void {
    const toSplit: Triangle[] = [];
    for (const tr of this.triangles) {
      if (Point.distance(p, tr.c) < tr.r) {
        toSplit.push(tr);
      }
    }

    if (toSplit.length > 0) {
      this.points.push(p);

      const a: Point[] = [];
      const b: Point[] = [];
      for (const t1 of toSplit) {
        let e1 = true;
        let e2 = true;
        let e3 = true;
        for (const t2 of toSplit) {
          if (t2 === t1) {
            continue;
          }
          // If triangles have a common edge, it goes in opposite directions.
          if (e1 && t2.hasEdge(t1.p2, t1.p1)) {
            e1 = false;
          }
          if (e2 && t2.hasEdge(t1.p3, t1.p2)) {
            e2 = false;
          }
          if (e3 && t2.hasEdge(t1.p1, t1.p3)) {
            e3 = false;
          }
          if (!(e1 || e2 || e3)) {
            break;
          }
        }
        if (e1) {
          a.push(t1.p1);
          b.push(t1.p2);
        }
        if (e2) {
          a.push(t1.p2);
          b.push(t1.p3);
        }
        if (e3) {
          a.push(t1.p3);
          b.push(t1.p1);
        }
      }

      let index = 0;
      do {
        const pa = a[index];
        const pb = b[index];
        if (pa === undefined || pb === undefined) {
          throw new Error("Voronoi.addPoint: boundary edge loop is broken");
        }
        this.triangles.push(new Triangle(p, pa, pb));
        index = a.indexOf(pb);
      } while (index !== 0);

      for (const tr of toSplit) {
        remove(this.triangles, tr);
      }

      this.regionsDirty = true;
    }
  }

  private buildRegion(p: Point): Region {
    const r = new Region(p);
    for (const tr of this.triangles) {
      if (tr.p1 === p || tr.p2 === p || tr.p3 === p) {
        r.vertices.push(tr);
      }
    }
    return r.sortVertices();
  }

  get regions(): Map<Point, Region> {
    if (this.regionsDirty) {
      this.regionsCache = new Map();
      this.regionsDirty = false;
      for (const p of this.points) {
        this.regionsCache.set(p, this.buildRegion(p));
      }
    }
    return this.regionsCache;
  }

  /** Checks that none of a triangle's vertices is a frame point. */
  private isReal(tr: Triangle): boolean {
    return !(
      contains(this.frame, tr.p1) ||
      contains(this.frame, tr.p2) ||
      contains(this.frame, tr.p3)
    );
  }

  /** Triangles which do not contain "frame" points as their vertices. */
  triangulation(): Triangle[] {
    return this.triangles.filter((tr) => this.isReal(tr));
  }

  /** Regions fully made of real triangles (name typo preserved from the source). */
  partioning(): Region[] {
    // Iterating over points, not regions, to use points ordering.
    const result: Region[] = [];
    for (const p of this.points) {
      const r = this.regions.get(p);
      if (r === undefined) {
        continue;
      }
      let isReal = true;
      for (const v of r.vertices) {
        if (!this.isReal(v)) {
          isReal = false;
          break;
        }
      }
      if (isReal) {
        result.push(r);
      }
    }
    return result;
  }

  getNeighbours(r1: Region): Region[] {
    const result: Region[] = [];
    for (const r2 of this.regions.values()) {
      if (r1.borders(r2)) {
        result.push(r2);
      }
    }
    return result;
  }

  /** One Lloyd relaxation step: moves (selected) seeds to their region centers. */
  static relax(voronoi: Voronoi, toRelax: Point[] | null = null): Voronoi {
    return relaxVoronoi(voronoi, toRelax);
  }

  /** Builds a diagram from seed points with an auto-sized frame. */
  static build(vertices: Point[]): Voronoi {
    return buildVoronoi(vertices);
  }
}
