/**
 * Purpose: numeric helpers (clamping and sign) shared by the town generation code.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/utils/MathUtils.hx.
 * Main exports: gate, gatei, sign.
 */

/** Clamps a float value into [min, max]. */
export function gate(value: number, min: number, max: number): number {
  return value < min ? min : value < max ? value : max;
}

/** Clamps an integer value into [min, max]. */
export function gatei(value: number, min: number, max: number): number {
  return value < min ? min : value < max ? value : max;
}

/** Returns -1, 0 or 1 depending on the sign of the value. */
export function sign(value: number): number {
  return value === 0 ? 0 : value < 0 ? -1 : 1;
}
