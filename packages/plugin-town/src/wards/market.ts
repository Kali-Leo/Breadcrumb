/**
 * Purpose: market ward — places a single fountain or statue near (or offset from) the patch
 * centroid; rated to avoid other markets and match the plaza size.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Market.hx.
 * Main exports: Market.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { interpolate } from "../geom/geomUtils";
import { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";
import { townRandom } from "../utils/townRandom";
import { Ward } from "./ward";

export class Market extends Ward {
  override createGeometry(): void {
    // fountain or statue
    const statue = townRandom.bool(0.6);
    // we always offset a statue and sometimes a fountain
    const offset = statue || townRandom.bool(0.3);

    let v0: Point | null = null;
    let v1: Point | null = null;
    if (statue || offset) {
      // we need an edge both for rotating a statue and offsetting
      // (forEdge unrolled so control-flow analysis tracks the v0/v1 assignments)
      const shape = this.patch.shape;
      let length = -1.0;
      for (let i = 0; i < shape.length; i++) {
        const p0 = shape.at(i);
        const p1 = shape.at((i + 1) % shape.length);
        const len = Point.distance(p0, p1);
        if (len > length) {
          length = len;
          v0 = p0;
          v1 = p1;
        }
      }
    }

    let object: Polygon;
    if (statue) {
      if (v0 === null || v1 === null) {
        throw new Error("Market patch has no edges");
      }
      object = Polygon.rect(1 + townRandom.float(), 1 + townRandom.float());
      object.rotate(Math.atan2(v1.y - v0.y, v1.x - v0.x));
    } else {
      object = Polygon.circle(1 + townRandom.float());
    }

    if (offset) {
      if (v0 === null || v1 === null) {
        throw new Error("Market patch has no edges");
      }
      const gravity = interpolate(v0, v1);
      object.offset(
        interpolate(this.patch.shape.centroid, gravity, 0.2 + townRandom.float() * 0.4),
      );
    } else {
      object.offset(this.patch.shape.centroid);
    }

    this.geometry = [object];
  }

  static rateLocation(model: Model, patch: Patch): number {
    // One market should not touch another
    for (const p of model.inner) {
      if (p.ward instanceof Market && p.shape.borders(patch.shape)) {
        return Number.POSITIVE_INFINITY;
      }
    }

    // Market shouldn't be much larger than the plaza
    return model.plaza !== null
      ? patch.shape.square / model.plaza.shape.square
      : patch.shape.distance(model.center);
  }

  override getLabel(): string {
    return "Market";
  }
}
