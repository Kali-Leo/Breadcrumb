/**
 * Purpose: ward assignment for the town model (Model.createWards as a free function) —
 * plaza market, gate wards, the shuffled WARDS list, outskirts and countryside.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Model.hx.
 * Main exports: createModelWards.
 */

import { min, random, remove } from "../utils/arrayHelpers";
import { townRandom } from "../utils/townRandom";
import { Farm } from "../wards/farm";
import { GateWard } from "../wards/gateWard";
import { Market } from "../wards/market";
import { Slum } from "../wards/slum";
import { Ward, type WardConstructor } from "../wards/ward";
import { itemAt } from "./arraySupport";
import { Model } from "./model";
import type { Patch } from "./patch";

/** Model.createWards: assigns a ward to every patch, inner city first, then countryside. */
export function createModelWards(model: Model, patchCount: number): void {
  const unassigned = model.inner.slice();
  if (model.plaza !== null) {
    model.plaza.ward = new Market(model, model.plaza);
    remove(unassigned, model.plaza);
  }

  // Assigning inner city gate wards
  for (const gate of model.border.gates) {
    for (const patch of model.patchByVertex(gate)) {
      if (
        patch.withinCity &&
        patch.ward === null &&
        townRandom.bool(model.wall === null ? 0.2 : 0.5)
      ) {
        patch.ward = new GateWard(model, patch);
        remove(unassigned, patch);
      }
    }
  }

  const wards = Model.WARDS.slice();
  // some shuffling
  for (let i = 0; i < Math.floor(wards.length / 10); i++) {
    const index = townRandom.int(0, wards.length - 1);
    const tmp = itemAt(wards, index);
    wards[index] = itemAt(wards, index + 1);
    wards[index + 1] = tmp;
  }

  // Assigning inner city wards
  while (unassigned.length > 0) {
    let bestPatch: Patch;

    const shifted = wards.length > 0 ? wards.shift() : undefined;
    const wardClass: WardConstructor = shifted !== undefined ? shifted : Slum;
    const rateLocation = wardClass.rateLocation;

    if (rateLocation === undefined) {
      do {
        bestPatch = random(unassigned);
      } while (bestPatch.ward !== null);
    } else {
      bestPatch = min(unassigned, (patch) =>
        patch.ward === null ? rateLocation(model, patch) : Number.POSITIVE_INFINITY,
      );
    }

    bestPatch.ward = new wardClass(model, bestPatch);

    remove(unassigned, bestPatch);
  }

  // Outskirts
  if (model.wall !== null) {
    for (const gate of model.wall.gates) {
      if (!townRandom.bool(1 / (patchCount - 5))) {
        for (const patch of model.patchByVertex(gate)) {
          if (patch.ward === null) {
            patch.withinCity = true;
            patch.ward = new GateWard(model, patch);
          }
        }
      }
    }
  }

  // Calculating radius and processing countryside
  model.cityRadius = 0;
  for (const patch of model.patches) {
    if (patch.withinCity) {
      // Radius of the city is the farthest point of all wards from the center
      for (const v of patch.shape) {
        model.cityRadius = Math.max(model.cityRadius, v.length);
      }
    } else if (patch.ward === null) {
      patch.ward =
        townRandom.bool(0.2) && patch.shape.compactness >= 0.7
          ? new Farm(model, patch)
          : new Ward(model, patch);
    }
  }
}
