/**
 * Purpose: military ward — regular blocks with squares, rated to border the citadel or walls.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/MilitaryWard.hx.
 * Main exports: MilitaryWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { Ward } from "./ward";
import { createAlleys } from "./wardShapes";

export class MilitaryWard extends Ward {
  override createGeometry(): void {
    const block = this.getCityBlock();
    this.geometry = createAlleys(
      block,
      Math.sqrt(block.square) * (1 + townRandom.float()),
      0.1 + townRandom.float() * 0.3, // regular
      0.3,
      0.25, // squares
    );
  }

  // Military ward should border the citadel or the city walls
  static rateLocation(model: Model, patch: Patch): number {
    if (model.citadel?.shape.borders(patch.shape)) {
      return 0;
    }
    if (model.wall?.borders(patch)) {
      return 1;
    }
    return model.citadel === null && model.wall === null ? 0 : Number.POSITIVE_INFINITY;
  }

  override getLabel(): string {
    return "Military";
  }
}
