/**
 * Purpose: cathedral (temple) ward — ring cloister or large orthogonal building, rated to
 * overlook or approach the plaza.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Cathedral.hx.
 * Main exports: Cathedral.
 */

import { ring } from "../building/cutter";
import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { Ward } from "./ward";
import { createOrthoBuilding } from "./wardShapes";

export class Cathedral extends Ward {
  override createGeometry(): void {
    this.geometry = townRandom.bool(0.4)
      ? ring(this.getCityBlock(), 2 + townRandom.float() * 4)
      : createOrthoBuilding(this.getCityBlock(), 50, 0.8);
  }

  // Ideally the main temple should overlook the plaza,
  // otherwise it should be as close to the plaza as possible
  static rateLocation(model: Model, patch: Patch): number {
    return model.plaza !== null && patch.shape.borders(model.plaza.shape)
      ? -1 / patch.shape.square
      : patch.shape.distance(model.plaza !== null ? model.plaza.shape.center : model.center) *
          patch.shape.square;
  }

  override getLabel(): string {
    return "Temple";
  }
}
