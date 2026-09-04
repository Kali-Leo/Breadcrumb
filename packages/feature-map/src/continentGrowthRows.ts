/**
 * Purpose: the arithmetic the growth pass needs — one row of the packed similarity matrix, the
 * direction of a cosine, and a fresh landmass. Split out of continentGrowth.ts to keep both
 * files under the size ceiling; nothing here decides clustering policy.
 * Main exports: addRowInto, cosineToDirection, newLandmass.
 */
import type { PackedVectors } from "@breadcrumb/core-vectors";
import type { Landmass } from "./continentGrowth";

export function addRowInto(target: Float64Array, packed: PackedVectors, row: number): void {
  for (let index = 0; index < packed.dims; index += 1) {
    target[index] = (target[index] ?? 0) + (packed.values[row * packed.dims + index] ?? 0);
  }
}

/** Cosine between a packed (already unit-length) row and a landmass's summed direction. */
export function cosineToDirection(
  packed: PackedVectors,
  row: number,
  direction: Float64Array,
): number {
  let dot = 0;
  let norm = 0;
  for (let index = 0; index < packed.dims; index += 1) {
    const component = direction[index] ?? 0;
    dot += (packed.values[row * packed.dims + index] ?? 0) * component;
    norm += component * component;
  }
  return norm === 0 ? 0 : dot / Math.sqrt(norm);
}

export function newLandmass(packed: PackedVectors, rows: readonly number[]): Landmass {
  const direction = new Float64Array(packed.dims);
  for (const row of rows) addRowInto(direction, packed, row);
  return { anchorRow: Math.min(...rows), rows: [...rows], direction };
}

/** Step 1: every unattached root joins the landmass it links into whose members point most
 * nearly its way — the rule mergeSingletonCommunities used, applied to a live map. Returns the
 * roots that found no home. */
