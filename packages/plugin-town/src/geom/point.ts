/**
 * Purpose: mutable 2D point replacing openfl.geom.Point plus the PointExtender static
 * extensions; algorithms rely on Point identity, so instances are shared by reference.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/utils/PointExtender.hx.
 * Main exports: Point.
 */

export class Point {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static distance(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }

  setTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** PointExtender.set: copies coordinates from another point (identity preserved). */
  set(q: Point): void {
    this.x = q.x;
    this.y = q.y;
  }

  /** openfl Point.offset: adds dx/dy in place. */
  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** openfl Point.normalize: scales this point to the given length in place (no-op on zero). */
  normalize(thickness: number): void {
    if (this.x !== 0 || this.y !== 0) {
      const factor = thickness / Math.sqrt(this.x * this.x + this.y * this.y);
      this.x *= factor;
      this.y *= factor;
    }
  }

  add(q: Point): Point {
    return new Point(this.x + q.x, this.y + q.y);
  }

  subtract(q: Point): Point {
    return new Point(this.x - q.x, this.y - q.y);
  }

  /** Alias of subtract, for ported call sites written as `sub`. */
  sub(q: Point): Point {
    return this.subtract(q);
  }

  /** Returns a new point scaled by the factor. */
  scale(f: number): Point {
    return new Point(this.x * f, this.y * f);
  }

  /** Returns a new point with the same direction and the given length. */
  norm(length = 1): Point {
    const p = this.clone();
    p.normalize(length);
    return p;
  }

  addEq(q: Point): void {
    this.x += q.x;
    this.y += q.y;
  }

  subEq(q: Point): void {
    this.x -= q.x;
    this.y -= q.y;
  }

  scaleEq(f: number): void {
    this.x *= f;
    this.y *= f;
  }

  /** Angle of this point as a vector: Math.atan2(y, x). */
  atan(): number {
    return Math.atan2(this.y, this.x);
  }

  dot(q: Point): number {
    return this.x * q.x + this.y * q.y;
  }

  /** Returns this vector rotated 90 degrees counter-clockwise (in y-down space). */
  rotate90(): Point {
    return new Point(-this.y, this.x);
  }
}
