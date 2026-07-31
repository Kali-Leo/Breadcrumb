/**
 * Purpose: array-like vertex container underlying Polygon — index access, mutation and
 * edge iteration. Vertices are shared Point references; identity (===) is significant.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Polygon.hx.
 * Main exports: PolygonCore.
 */

import { max as arrayMax, min as arrayMin } from "../utils/arrayHelpers";
import type { Point } from "./point";

export class PolygonCore implements Iterable<Point> {
  /** Shared Point references; the array object is owned by this polygon. */
  readonly vertices: Point[];

  constructor(vertices: readonly Point[] | null = null) {
    this.vertices = vertices !== null ? vertices.slice() : [];
  }

  get length(): number {
    return this.vertices.length;
  }

  at(index: number): Point {
    const vertex = this.vertices[index];
    if (vertex === undefined) {
      throw new RangeError(`Polygon index ${index} out of range (length ${this.vertices.length})`);
    }
    return vertex;
  }

  /** Replaces the vertex reference at an index. */
  set(index: number, vertex: Point): void;
  /** Haxe Polygon.set: copies coordinates from another polygon into existing vertices. */
  set(source: PolygonCore): void;
  set(indexOrSource: number | PolygonCore, vertex?: Point): void {
    if (typeof indexOrSource === "number") {
      if (vertex === undefined) {
        throw new Error("set(index) requires a vertex");
      }
      this.vertices[indexOrSource] = vertex;
    } else {
      for (let i = 0; i < indexOrSource.length; i++) {
        this.at(i).set(indexOrSource.at(i));
      }
    }
  }

  push(vertex: Point): number {
    return this.vertices.push(vertex);
  }

  unshift(vertex: Point): number {
    return this.vertices.unshift(vertex);
  }

  insert(index: number, vertex: Point): void {
    this.vertices.splice(index, 0, vertex);
  }

  /** Removes the first occurrence of the vertex reference (Haxe Array.remove). */
  remove(vertex: Point): boolean {
    const index = this.vertices.indexOf(vertex);
    if (index === -1) {
      return false;
    }
    this.vertices.splice(index, 1);
    return true;
  }

  splice(start: number, deleteCount: number): Point[] {
    return this.vertices.splice(start, deleteCount);
  }

  indexOf(vertex: Point): number {
    return this.vertices.indexOf(vertex);
  }

  lastIndexOf(vertex: Point): number {
    return this.vertices.lastIndexOf(vertex);
  }

  /** Identity containment check (Haxe Polygon.contains). */
  contains(vertex: Point): boolean {
    return this.vertices.indexOf(vertex) !== -1;
  }

  [Symbol.iterator](): Iterator<Point> {
    return this.vertices[Symbol.iterator]();
  }

  /** Vertex with the smallest measure (Haxe `using ArrayExtender` on the Polygon abstract). */
  min(measure: (v: Point) => number): Point {
    return arrayMin(this.vertices, measure);
  }

  /** Vertex with the largest measure (Haxe `using ArrayExtender` on the Polygon abstract). */
  max(measure: (v: Point) => number): Point {
    return arrayMax(this.vertices, measure);
  }

  /** Calls f for every edge including the closing v(n)-v(0) edge. */
  forEdge(f: (v0: Point, v1: Point) => void): void {
    const len = this.length;
    for (let i = 0; i < len; i++) {
      f(this.at(i), this.at((i + 1) % len));
    }
  }

  /** Like forEdge but skips the closing v(n)-v(0) edge. */
  forSegment(f: (v0: Point, v1: Point) => void): void {
    for (let i = 0; i < this.length - 1; i++) {
      f(this.at(i), this.at(i + 1));
    }
  }

  /** Translates all vertices in place. */
  offset(p: Point): void {
    const dx = p.x;
    const dy = p.y;
    for (const v of this.vertices) {
      v.offset(dx, dy);
    }
  }

  /** Rotates all vertices around the origin in place. */
  rotate(a: number): void {
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    for (const v of this.vertices) {
      const vx = v.x * cosA - v.y * sinA;
      const vy = v.y * cosA + v.x * sinA;
      v.setTo(vx, vy);
    }
  }

  /** Index of the edge a->b, or -1 (identity comparison). */
  findEdge(a: Point, b: Point): number {
    const index = this.vertices.indexOf(a);
    return index !== -1 && this.vertices[(index + 1) % this.length] === b ? index : -1;
  }

  /** Vertex following a (for a missing vertex this returns vertex 0, as in Haxe). */
  next(a: Point): Point {
    return this.at((this.vertices.indexOf(a) + 1) % this.length);
  }

  /** Vertex preceding a. */
  prev(a: Point): Point {
    return this.at((this.vertices.indexOf(a) + this.length - 1) % this.length);
  }

  /** Edge vector starting at vertex v. */
  vector(v: Point): Point {
    return this.next(v).subtract(v);
  }

  /** Edge vector starting at vertex index i. */
  vectori(i: number): Point {
    return this.at(i === this.length - 1 ? 0 : i + 1).subtract(this.at(i));
  }
}
