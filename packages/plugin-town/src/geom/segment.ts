/**
 * Purpose: line segment between two shared Point references, with derived vector getters.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Segment.hx.
 * Main exports: Segment.
 */

import { Point } from "./point";

export class Segment {
  start: Point;
  end: Point;

  constructor(start: Point, end: Point) {
    this.start = start;
    this.end = end;
  }

  get dx(): number {
    return this.end.x - this.start.x;
  }

  get dy(): number {
    return this.end.y - this.start.y;
  }

  get vector(): Point {
    return this.end.subtract(this.start);
  }

  get length(): number {
    return Point.distance(this.start, this.end);
  }
}
