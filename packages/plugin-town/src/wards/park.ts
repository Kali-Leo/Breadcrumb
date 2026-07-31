/**
 * Purpose: park ward — radial (or semi-radial for stretched blocks) sector layout with alleys.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Park.hx.
 * Main exports: Park.
 */

import { radial, semiRadial } from "../building/cutter";
import { Ward } from "./ward";
import { ALLEY } from "./wardShapes";

export class Park extends Ward {
  override createGeometry(): void {
    const block = this.getCityBlock();
    this.geometry =
      block.compactness >= 0.7 ? radial(block, null, ALLEY) : semiRadial(block, null, ALLEY);
  }

  override getLabel(): string {
    return "Park";
  }
}
