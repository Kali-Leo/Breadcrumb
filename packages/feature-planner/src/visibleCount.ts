/**
 * Purpose: which frontier candidates are actually shown, and in what order —
 * cut the ranked list at the largest score cliff between the 3rd and 6th position, so one
 * great candidate is never padded with weak ones and five
 * equal ones are never cut arbitrarily; then hand the third shown position to the candidate
 * with the thinnest evidence behind it. Pure math, no DB, no I/O.
 *
 * Why both steps live here, in this order: splicing the exploration slot into the ranked list
 * before the cliff search (back in frontier()) would leave a possibly-zero-score
 * candidate sitting at index 2 of a list the cliff search assumes is descending. The drop at
 * the cut just past it would come out negative, `bestDrop = 0` would ignore it, the real cliff
 * would be hidden inside that negative drop, and the search would settle on some meaningless
 * dip near the tail — cutting the genuine 4th-place candidate while a 0.000-scoring
 * exploration pick stays on screen. Measuring the cliff first, and only then reordering inside
 * what survived, means exploration can shuffle the shown set but can never shorten it or push a
 * higher-scoring candidate off it.
 * Main exports: visibleFrontier, FRONTIER_VISIBLE_MIN, FRONTIER_VISIBLE_MAX,
 * EXPLORATION_SLOT_INDEX.
 */

export const FRONTIER_VISIBLE_MIN = 3;
export const FRONTIER_VISIBLE_MAX = 6;

/** Which shown position the exploration slot occupies (0-based): the top two stay purely
 * score-ranked, the third is where a thin-evidence candidate may be promoted. */
export const EXPLORATION_SLOT_INDEX = 2;

/** What visibleFrontier needs of a candidate. Only `score` is required — the two optional
 * fields simply switch the exploration step off when a caller doesn't carry them. */
export interface VisibleCandidate {
  score: number;
  kind?: string;
  /** The interest evidenceWeight (aggregateInterest's shrinkage mass) behind this candidate. */
  evidenceWeight?: number;
}

/**
 * The visible recommendation set: candidates[0..k) where k ∈ [MIN, MAX] sits at the largest
 * drop between consecutive scores, reordered by the exploration slot. "Show everything up to
 * MAX" counts as a zero-drop cut, so a flat, cliff-less list yields min(length, MAX) — equally
 * good candidates all show. Fewer than MIN candidates show as-is. Ties break toward showing
 * more. Expects `candidates` in descending score order, which is what frontier() returns.
 */
export function visibleFrontier<Candidate extends VisibleCandidate>(
  candidates: readonly Candidate[],
): Candidate[] {
  return withExplorationSlot(candidates.slice(0, cliffCut(candidates)));
}

/** How many candidates to show: the position of the largest score drop inside [MIN, MAX]. */
function cliffCut(candidates: readonly { score: number }[]): number {
  if (candidates.length <= FRONTIER_VISIBLE_MIN) return candidates.length;
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
  return bestCut;
}

/**
 * Hands the third shown position to the concept candidate with the least evidence behind its
 * interest score, among those below the top two — uncertainty-driven exploration, so the top
 * three can't be the same frozen trio forever. Deterministic: no randomness, no bandit
 * (single-user sparse data cannot train one).
 *
 * A pure reordering of what is already shown: nobody is added, nobody is dropped. A no-op when
 * no candidate carries an evidence weight (nothing to be uncertain about), when there is
 * nothing below the top two, or when that candidate already has the thinnest evidence — the
 * slot is never spent on a swap that buys no information. Method candidates are skipped: they
 * sit in their own bucket after the concepts, and promoting one would undo that bucketing.
 */
function withExplorationSlot<Candidate extends VisibleCandidate>(
  visible: readonly Candidate[],
): Candidate[] {
  if (visible.length <= EXPLORATION_SLOT_INDEX + 1) return [...visible];
  if (!visible.some((candidate) => candidate.evidenceWeight !== undefined)) return [...visible];
  const head = visible.slice(0, EXPLORATION_SLOT_INDEX);
  const rest = visible.slice(EXPLORATION_SLOT_INDEX);
  const evidence = (candidate: Candidate) => candidate.evidenceWeight ?? 0;
  const eligible = rest.filter((candidate) => candidate.kind !== "method");
  // Strict `<` keeps the incumbent on ties, so the promotion only ever happens when the
  // exploration pick genuinely has thinner evidence than the natural third place.
  const explorer = eligible.reduce<Candidate | undefined>(
    (best, candidate) =>
      best === undefined || evidence(candidate) < evidence(best) ? candidate : best,
    undefined,
  );
  if (explorer === undefined) return [...visible];
  return [...head, explorer, ...rest.filter((candidate) => candidate !== explorer)];
}
