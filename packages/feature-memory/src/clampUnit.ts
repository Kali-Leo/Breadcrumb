/**
 * Purpose: the one clamp every 0..1 score in the product passes through, and the one place the
 * question "what does a non-finite number mean here" is answered — once, the same way, for
 * retention, mastery, interest diffusion and the frontier's normalized components.
 *
 * Why it exists: `Math.max(0, Math.min(1, NaN))` is NaN. Every hand-written clamp in the
 * product was that expression, so one unparsable `created_at` could travel through all of
 * them untouched and reach a sort comparator, where every NaN comparison is false and V8
 * leaves the array in its original order — the recommendation list silently collapses into
 * database insertion order, with nothing visibly wrong.
 *
 * The rule, stated once so the two halves of the codebase stop disagreeing: a non-finite value
 * is not a low score, it is *no score*, and it is reported as 0. Not dropped — dropping is a
 * decision only the caller can make (layers.ts skips the bad row; mastery.ts must still return
 * an entry for the node) — and 0 is already what an absent entry means to every consumer
 * downstream, so a poisoned component lands exactly where "no evidence" lands.
 *
 * Home: this is a domain-free numeric helper and its natural home is a shared core package;
 * it lives here because feature-memory is the dependency-leaf of the three feature packages
 * that need it, and because the contract it encodes was first written down in retention.ts.
 * It carries no threshold and no domain constant, so importing it does not couple the mastery
 * and planner layers, which are meant to stay independent.
 * Main exports: clampUnit, finiteOr, compareDesc.
 */

/** Clamps to [0,1]; a non-finite value (NaN, ±Infinity) is 0. See the rule above. */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** `value` when it is a finite number, `fallback` otherwise — the unbounded sibling of
 * clampUnit, for quantities that are not probabilities (evidence mass, expected day gains). */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Descending numeric comparator that is a total order even when a value slipped through as
 * NaN: non-finite sorts last instead of making every comparison false. Returns 0 for a genuine
 * tie so callers can chain their own deterministic tie-break after it. */
export function compareDesc(a: number, b: number): number {
  const left = Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY;
  const right = Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY;
  return right === left ? 0 : right - left;
}
