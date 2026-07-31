/**
 * Purpose: merchant ward — medium-to-large lots close to the center, with some vacancy.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/MerchantWard.hx.
 * Main exports: MerchantWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";

export class MerchantWard extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      50 + 60 * townRandom.float() * townRandom.float(), // medium to large
      0.5 + townRandom.float() * 0.3, // moderately regular
      0.7,
      0.15,
    );
  }

  // Merchant ward should be as close to the center as possible
  static rateLocation(model: Model, patch: Patch): number {
    return patch.shape.distance(model.plaza !== null ? model.plaza.shape.center : model.center);
  }

  override getLabel(): string {
    return "Merchant";
  }
}
