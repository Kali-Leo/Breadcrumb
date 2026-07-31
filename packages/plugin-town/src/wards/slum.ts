/**
 * Purpose: slum ward — small chaotic lots, rated to lie as far from the center as possible.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Slum.hx.
 * Main exports: Slum.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";

export class Slum extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      10 + 30 * townRandom.float() * townRandom.float(), // small to medium
      0.6 + townRandom.float() * 0.4, // chaotic
      0.8,
      0.03,
    );
  }

  // Slums should be as far from the center as possible
  static rateLocation(model: Model, patch: Patch): number {
    return -patch.shape.distance(model.plaza !== null ? model.plaza.shape.center : model.center);
  }

  override getLabel(): string {
    return "Slum";
  }
}
