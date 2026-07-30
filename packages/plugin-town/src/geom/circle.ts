/**
 * Purpose: plain circle value (center + radius) used by town geometry.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Circle.hx.
 * Main exports: Circle.
 */

export class Circle {
  x: number;
  y: number;
  r: number;

  constructor(x = 0, y = 0, r = 0) {
    this.x = x;
    this.y = y;
    this.r = r;
  }
}
