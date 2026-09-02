/**
 * Purpose: how many frontier candidates are actually worth showing (spec 060 §1) — cut the
 * ranked list at the largest score cliff between the 3rd and 6th position (bounds are Leo's
 * 2026-08-31 ruling), so one great candidate is never padded with weak ones and five equal
 * ones are never cut arbitrarily. Pure math, no DB, no I/O.
 * Main exports: visibleFrontier, FRONTIER_VISIBLE_MIN, FRONTIER_VISIBLE_MAX.
 */

export const FRONTIER_VISIBLE_MIN = 3;
export const FRONTIER_VISIBLE_MAX = 6;

/**
 * The visible recommendation set: candidates[0..k) where k ∈ [MIN, MAX] sits at the largest
 * drop between consecutive scores. "Show everything up to MAX" counts as a zero-drop cut, so
 * a flat, cliff-less list yields min(length, MAX) — equally good candidates all show. Fewer
 * than MIN candidates show as-is. Ties break toward showing more.
 */
export function visibleFrontier<Candidate extends { score: number }>(
  candidates: readonly Candidate[],
): Candidate[] {
  if (candidates.length <= FRONTIER_VISIBLE_MIN) return [...candidates];
  const lastCut = Math.min(FRONTIER_VISIBLE_MAX, candidates.length);
  let bestCut = lastCut;
  let bestDrop = 0;
  for (let cut = FRONTIER_VISIBLE_MIN; cut < lastCut; cut += 1) {
    const drop = (candidates[cut - 1]?.score ?? 0) - (candidates[cut]?.score ?? 0);
    if (drop > bestDrop) {
      bestDrop = drop;
      bestCut = cut;
    }
  }
  return candidates.slice(0, bestCut);
}
