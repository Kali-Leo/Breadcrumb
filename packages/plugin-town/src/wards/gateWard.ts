/**
 * Purpose: gate ward — a common ward that grows just inside or outside a city gate.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/GateWard.hx.
 * Main exports: GateWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";

export class GateWard extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      10 + 50 * townRandom.float() * townRandom.float(),
      0.5 + townRandom.float() * 0.3,
      0.7,
    );
  }

  override getLabel(): string {
    return "Gate";
  }
}
