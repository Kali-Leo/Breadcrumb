/**
 * Purpose: patriciate ward — large lots with vacancy, prefers bordering parks over slums.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/PatriciateWard.hx.
 * Main exports: PatriciateWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";
import { Park } from "./park";
import { Slum } from "./slum";

export class PatriciateWard extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      80 + 30 * townRandom.float() * townRandom.float(), // large
      0.5 + townRandom.float() * 0.3, // moderately regular
      0.8,
      0.2,
    );
  }

  // Patriciate ward prefers to border a park and not to border slums
  static rateLocation(model: Model, patch: Patch): number {
    let rate = 0;
    for (const p of model.patches) {
      if (p.ward !== null && p.shape.borders(patch.shape)) {
        if (p.ward instanceof Park) {
          rate--;
        } else if (p.ward instanceof Slum) {
          rate++;
        }
      }
    }
    return rate;
  }

  override getLabel(): string {
    return "Patriciate";
  }
}
