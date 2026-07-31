/**
 * Purpose: craftsmen ward — small-to-large lots, moderately regular grid (the most common
 * ward in the WARDS list).
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/CraftsmenWard.hx.
 * Main exports: CraftsmenWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { townRandom } from "../utils/townRandom";
import { CommonWard } from "./commonWard";

export class CraftsmenWard extends CommonWard {
  constructor(model: Model, patch: Patch) {
    super(
      model,
      patch,
      10 + 80 * townRandom.float() * townRandom.float(), // small to large
      0.5 + townRandom.float() * 0.2, // moderately regular
      0.6,
    );
  }

  override getLabel(): string {
    return "Craftsmen";
  }
}
