/**
 * Purpose: parameterized residential ward — alley subdivision of the city block with
 * configurable lot size, grid/size chaos and vacancy probability.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/CommonWard.hx.
 * Main exports: CommonWard.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { Ward } from "./ward";
import { createAlleys } from "./wardShapes";

export class CommonWard extends Ward {
  private readonly minSq: number;
  private readonly gridChaos: number;
  private readonly sizeChaos: number;
  private readonly emptyProb: number;

  constructor(
    model: Model,
    patch: Patch,
    minSq: number,
    gridChaos: number,
    sizeChaos: number,
    emptyProb = 0.04,
  ) {
    super(model, patch);

    this.minSq = minSq;
    this.gridChaos = gridChaos;
    this.sizeChaos = sizeChaos;
    this.emptyProb = emptyProb;
  }

  override createGeometry(): void {
    const block = this.getCityBlock();
    this.geometry = createAlleys(block, this.minSq, this.gridChaos, this.sizeChaos, this.emptyProb);

    if (!this.model.isEnclosed(this.patch)) {
      this.filterOutskirts();
    }
  }
}
