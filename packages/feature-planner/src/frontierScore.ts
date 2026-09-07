/**
 * Purpose: how frontier() turns raw per-candidate components into one comparable number and
 * one ordered list — min-max normalization inside the candidate set, named (provisional)
 * weights, and the concept/method bucketing that keeps method nodes out of the concept top-3.
 * The exploration slot lives in visibleCount.ts, because it may only reorder candidates that
 * are already being shown. Pure math, no DB, no I/O.
 * Main exports: FRONTIER_WEIGHTS, GOAL_GAP_SCORE_BOOST, normalizeAndScore,
 * bucketConceptsFirst, FrontierScoreParts.
 */

/** Weight on the goal-gap indicator, kept under its original name because
 * feature-memory/tuning.ts re-exports it as `goalGapScoreBoost`. It is no longer a flat score
 * addend: every component is min-max normalized to [0,1] inside the candidate set first, so
 * this is a weight on a 0/1 indicator, comparable with the other three. */
export const GOAL_GAP_SCORE_BOOST = 2;

/** Weights on the min-max-normalized components. PROVISIONAL — no empirical calibration
 * exists for them and single-user sparse data cannot fit one; they
 * encode a product stance, not a measurement: interest weighs as much as accumulated
 * helps-support, structural depth is only a mild penalty, and an explicitly chosen goal
 * outranks both. Without the normalization, the three components have incomparable units
 * (an unbounded weight sum, a shrunk 0..1 score, an integer count), so only the integer would
 * decide the order. */
export const FRONTIER_WEIGHTS = {
  helps: 1,
  interest: 1,
  difficulty: 0.5,
  goalGap: GOAL_GAP_SCORE_BOOST,
  /** Browsing affinity at half the conversational-interest weight — a product
   * stance, not a measurement: what the learner watches is a passive, platform-polluted
   * environment signal, and it must never outvote what they actively said in conversation. */
  browsing: 0.5,
} as const;

/** User-tunable copy of the weight table — FRONTIER_WEIGHTS is the default;
 * the palace's 推荐偏好 panel persists the learner's own values in this shape. */
export type FrontierWeights = { -readonly [Component in keyof typeof FRONTIER_WEIGHTS]: number };

export interface FrontierScoreParts {
  helps: number;
  interest: number;
  /** Longest chain of prerequisites standing behind this node — how much the learner has to
   * have covered before it makes sense. Subtracted, so the candidate with the fewest courses
   * to make up first wins, which is what the 先挑轻松的 slider says on the tin. */
  difficulty: number;
  /** 1 when inside the selected goal's gap, 0 otherwise. */
  goalGap: number;
  /** Browsing affinity in [0,1] — 0 when the interest service is absent, which
   * min-max normalization then treats as "carries no information", exactly right. */
  browsing: number;
}

/** Min-max normalization inside the candidate set: the best candidate on a component gets 1,
 * the worst 0, everything else in between. When every candidate shares a value that component
 * carries no information and normalizes to 0 for all of them, which is exactly right — it
 * then cannot decide the order. */
function normalizer(values: readonly number[]): (value: number) => number {
  // Only finite values define the range, and a non-finite one normalizes to 0 rather than
  // travelling on. If a NaN reached Math.min/Math.max, both endpoints would become NaN and
  // hand *every* candidate a NaN score; frontier()'s comparator would then return NaN for
  // every pair, V8 would read that as "equal", and the recommendation list would come out in
  // database insertion order with no error anywhere. Infinity would do the same via span = ∞.
  // A reduce, not Math.min(...values): the spread throws RangeError past ~100k candidates.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) return () => 0;
  return (value: number) => (Number.isFinite(value) ? (value - min) / span : 0);
}

/** Weighted sum of the five normalized components, in candidate order. */
export function normalizeAndScore(
  parts: readonly FrontierScoreParts[],
  weights: FrontierWeights = FRONTIER_WEIGHTS,
): number[] {
  if (parts.length === 0) return [];
  const helps = normalizer(parts.map((part) => part.helps));
  const interest = normalizer(parts.map((part) => part.interest));
  const difficulty = normalizer(parts.map((part) => part.difficulty));
  const goalGap = normalizer(parts.map((part) => part.goalGap));
  const browsing = normalizer(parts.map((part) => part.browsing));
  return parts.map(
    (part) =>
      weights.helps * helps(part.helps) +
      weights.interest * interest(part.interest) -
      weights.difficulty * difficulty(part.difficulty) +
      weights.goalGap * goalGap(part.goalGap) +
      weights.browsing * browsing(part.browsing),
  );
}

interface Bucketable {
  kind: "concept" | "method";
}

/** Concept candidates first, method candidates after, each bucket keeping the score-ranked
 * order it came in with. Every consumer reads this list as a prefix (ContinueCard takes 3,
 * kingdomView takes [0] + slice(1,3), MapView takes [0]), so ordering the buckets IS the
 * bucketing — no new field for callers to learn, and a method node can still be reached once
 * the concepts run out. Without it a method node ("费曼技巧") parks itself at the head forever:
 * it has no prerequisites and conversation never lights it, which is the mechanism behind
 * simlab's frozen-frontier tripwire.
 *
 * Both buckets stay strictly score-descending. That is a contract, not an accident:
 * visibleFrontier reads this list for the largest score cliff and can only do that on a list
 * whose scores never go back up. Splicing the exploration slot in right here would break it —
 * see visibleCount.ts. */
export function bucketConceptsFirst<T extends Bucketable>(ranked: readonly T[]): T[] {
  return [
    ...ranked.filter((candidate) => candidate.kind !== "method"),
    ...ranked.filter((candidate) => candidate.kind === "method"),
  ];
}
