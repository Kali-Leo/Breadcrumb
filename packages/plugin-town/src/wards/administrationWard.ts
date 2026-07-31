/**
 * Purpose: administration ward — large regular lots, rated to overlook or approach the plaza.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/AdministrationWard.hx.
 * Main exports: AdministrationWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";

export class AdministrationWard extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      80 + 30 * townRandom.float() * townRandom.float(), // large
      0.1 + townRandom.float() * 0.3, // regular
      0.3,
    );
  }

  // Ideally administration ward should overlook the plaza,
  // otherwise it should be as close to the plaza as possible
  static rateLocation(model: Model, patch: Patch): number {
    return model.plaza !== null
      ? patch.shape.borders(model.plaza.shape)
        ? 0
        : patch.shape.distance(model.plaza.shape.center)
      : patch.shape.distance(model.center);
  }

  override getLabel(): string {
    return "Administration";
  }
}
