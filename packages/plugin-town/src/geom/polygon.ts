/**
 * Purpose: Polygon — central geometry type of the town generator: vertex container plus
 * measures, smoothing, insetting, buffering, shrinking and cutting. Vertices are shared refs.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: Polygon.
 */

import { Point } from "./point";
import { PolygonCore } from "./polygonCore";
import { cutPolygon, peelPolygon, shrinkPolygon } from "./polygonCut";
import {
  type Bounds,
  polygonBorders,
  polygonCenter,
  polygonCentroid,
  polygonCompactness,
  polygonDistance,
  polygonGetBounds,
  polygonInterpolate,
  polygonIsConvex,
  polygonIsConvexVertex,
  polygonIsConvexVertexi,
  polygonPerimeter,
  polygonSquare,
} from "./polygonMeasure";
import { bufferPolygon } from "./polygonOps";
import {
  filterShortVertices,
  insetPolygonEdge,
  simplyfyPolygon,
  smoothPolygonVertex,
  smoothPolygonVertexi,
  smoothVertexEqVertices,
} from "./polygonShape";

export class Polygon extends PolygonCore {
  static rect(w = 1.0, h = 1.0): Polygon {
    return new Polygon([
      new Point(-w / 2, -h / 2),
      new Point(w / 2, -h / 2),
      new Point(w / 2, h / 2),
      new Point(-w / 2, h / 2),
    ]);
  }

  static regular(n = 8, r = 1.0): Polygon {
    const vertices: Point[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      vertices.push(new Point(r * Math.cos(a), r * Math.sin(a)));
    }
    return new Polygon(vertices);
  }

  static circle(r = 1.0): Polygon {
    return Polygon.regular(16, r);
  }

  get square(): number {
    return polygonSquare(this);
  }

  get perimeter(): number {
    return polygonPerimeter(this);
  }

  get compactness(): number {
    return polygonCompactness(this);
  }

  get center(): Point {
    return polygonCenter(this);
  }

  get centroid(): Point {
    return polygonCentroid(this);
  }

  distance(p: Point): number {
    return polygonDistance(this, p);
  }

  interpolate(p: Point): number[] {
    return polygonInterpolate(this, p);
  }

  borders(another: PolygonCore): boolean {
    return polygonBorders(this, another);
  }

  getBounds(): Bounds {
    return polygonGetBounds(this);
  }

  isConvexVertexi(i: number): boolean {
    return polygonIsConvexVertexi(this, i);
  }

  isConvexVertex(v1: Point): boolean {
    return polygonIsConvexVertex(this, v1);
  }

  isConvex(): boolean {
    return polygonIsConvex(this);
  }

  smoothVertexi(i: number, f = 1.0): Point {
    return smoothPolygonVertexi(this, i, f);
  }

  smoothVertex(v: Point, f = 1.0): Point {
    return smoothPolygonVertex(this, v, f);
  }

  smoothVertexEq(f = 1.0): Polygon {
    return new Polygon(smoothVertexEqVertices(this, f));
  }

  filterShort(threshold: number): Polygon {
    return new Polygon(filterShortVertices(this, threshold));
  }

  inset(p1: Point, d: number): void {
    insetPolygonEdge(this, p1, d);
  }

  insetAll(d: readonly number[]): Polygon {
    const p = new Polygon(this.vertices);
    for (let i = 0; i < p.length; i++) {
      const dd = d[i] ?? 0;
      if (dd !== 0) {
        p.inset(p.at(i), dd);
      }
    }
    return p;
  }

  insetEq(d: number): void {
    for (let i = 0; i < this.length; i++) {
      this.inset(this.at(i), d);
    }
  }

  buffer(d: readonly number[]): Polygon {
    return bufferPolygon(this, d);
  }

  bufferEq(d: number): Polygon {
    return this.buffer(this.vertices.map(() => d));
  }

  shrink(d: readonly number[]): Polygon {
    return shrinkPolygon(this, d);
  }

  shrinkEq(d: number): Polygon {
    return this.shrink(this.vertices.map(() => d));
  }

  peel(v1: Point, d: number): Polygon {
    return peelPolygon(this, v1, d);
  }

  cut(p1: Point, p2: Point, gap = 0): Polygon[] {
    return cutPolygon(this, p1, p2, gap);
  }

  split(p1: Point, p2: Point): Polygon[] {
    return this.spliti(this.indexOf(p1), this.indexOf(p2));
  }

  spliti(i1: number, i2: number): Polygon[] {
    const from = Math.min(i1, i2);
    const to = Math.max(i1, i2);
    return [
      new Polygon(this.vertices.slice(from, to + 1)),
      new Polygon(this.vertices.slice(to).concat(this.vertices.slice(0, from + 1))),
    ];
  }

  /** Name (with typo) preserved from the Haxe source. */
  simplyfy(n: number): void {
    simplyfyPolygon(this, n);
  }
}
