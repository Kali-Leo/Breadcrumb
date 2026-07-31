/**
 * Purpose: castle ward — builds its own curtain wall on the citadel patch and dense
 * orthogonal buildings well inset from the walls.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Castle.hx.
 * Main exports: Castle.
 */

import { CurtainWall } from "../building/curtainWall";
import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { Ward } from "./ward";
import { createOrthoBuilding, MAIN_STREET } from "./wardShapes";

export class Castle extends Ward {
  wall: CurtainWall;

  constructor(model: Model, patch: Patch) {
    super(model, patch);

    this.wall = new CurtainWall(
      true,
      model,
      [patch],
      [...patch.shape].filter((v) => model.patchByVertex(v).some((p) => !p.withinCity)),
    );
  }

  override createGeometry(): void {
    const block = this.patch.shape.shrinkEq(MAIN_STREET * 2);
    this.geometry = createOrthoBuilding(block, Math.sqrt(block.square) * 4, 0.6);
  }

  override getLabel(): string {
    return "Castle";
  }
}
