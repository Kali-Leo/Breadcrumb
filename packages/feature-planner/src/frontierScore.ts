/**
 * Purpose: how frontier() turns raw per-candidate components into one comparable number and
 * one ordered list — min-max normalization inside the candidate set, named (provisional)
 * weights, the concept/method bucketing that keeps method nodes out of the concept top-3, and
 * the deterministic uncertainty-driven exploration slot. Pure math, no DB, no I/O.
 * Main exports: FRONTIER_WEIGHTS, GOAL_GAP_SCORE_BOOST, EXPLORATION_SLOT_INDEX,
 * normalizeAndScore, bucketConceptsFirst, FrontierScoreParts.
 */

/** Weight on the goal-gap indicator, kept under its original name because
 * feature-memory/tuning.ts re-exports it as `goalGapScoreBoost`. It is no longer a flat score
 * addend: every component is min-max normalized to [0,1] inside the candidate set first, so
 * this is a weight on a 0/1 indicator, comparable with the other three. */
export const GOAL_GAP_SCORE_BOOST = 2;

/** Weights on the min-max-normalized components. PROVISIONAL — no empirical calibration
 * exists for them and single-user sparse data cannot fit one (2026-08-28 design audit); they
 * encode a product stance, not a measurement: interest weighs as much as accumulated
 * helps-support, structural depth is only a mild penalty, and an explicitly chosen goal
 * outranks both. Before the normalization landed the three components had incomparable units
 * (an unbounded weight sum, a shrunk 0..1 score, an integer count), so only the integer ever
 * decided the order — that, not the numbers below, was the real bug. */
export const FRONTIER_WEIGHTS = {
  helps: 1,
  interest: 1,
  difficulty: 0.5,
  goalGap: GOAL_GAP_SCORE_BOOST,
  /** Browsing affinity (spec 059) at half the conversational-interest weight — a product
   * stance, not a measurement: what the learner watches is a passive, platform-polluted
   * environment signal, and it must never outvote what they actively said in conversation. */
  browsing: 0.5,
} as const;

/** User-tunable copy of the weight table (spec 060 §3) — FRONTIER_WEIGHTS is the default;
 * the palace's 推荐偏好 panel persists the learner's own values in this shape. */
export type FrontierWeights = { -readonly [Component in keyof typeof FRONTIER_WEIGHTS]: number };

/** Which position in the concept bucket the exploration slot occupies (0-based): the top two
 * stay purely score-ranked, the third is where a thin-evidence candidate may be promoted. */
export const EXPLORATION_SLOT_INDEX = 2;

export interface FrontierScoreParts {
  helps: number;
  interest: number;
  /** Longest downstream requires-chain starting at this node — how much structure still hangs
   * off it. Subtracted, so a candidate at the head of a long chain is the heavier commitment. */
  difficulty: number;
  /** 1 when inside the selected goal's gap, 0 otherwise. */
  goalGap: number;
  /** Browsing affinity in [0,1] (spec 059) — 0 when the interest service is absent, which
   * min-max normalization then treats as "carries no information", exactly right. */
  browsing: number;
}

/** Min-max normalization inside the candidate set: the best candidate on a component gets 1,
 * the worst 0, everything else in between. When every candidate shares a value that component
 * carries no information and normalizes to 0 for all of them, which is exactly right — it
 * then cannot decide the order. */
function normalizer(values: readonly number[]): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return span === 0 ? () => 0 : (value: number) => (value - min) / span;
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
  label: string;
  evidenceWeight?: number;
}

/** Concept candidates first, method candidates after, each bucket keeping the score-ranked
 * order it came in with; the exploration slot applies to the concept bucket only. Every
 * consumer reads this list as a prefix (ContinueCard takes 3, kingdomView takes [0] +
 * slice(1,3), MapView takes [0]), so ordering the buckets IS the bucketing — no new field for
 * callers to learn, and a method node can still be reached once the concepts run out. Without
 * it a method node ("费曼技巧") parks itself at the head forever: it has no prerequisites and
 * conversation never lights it, which is the mechanism behind simlab's frozen-frontier
 * tripwire. */
export function bucketConceptsFirst<T extends Bucketable>(
  ranked: readonly T[],
  hasEvidenceWeights: boolean,
): T[] {
  return [
    ...withExplorationSlot(
      ranked.filter((candidate) => candidate.kind !== "method"),
      hasEvidenceWeights,
    ),
    ...ranked.filter((candidate) => candidate.kind === "method"),
  ];
}

/** Reserves the third position for the candidate with the least evidence behind its interest
 * score (aggregateInterest's shrinkage mass) among those outside the top two — uncertainty-
 * driven exploration, so the top three can't be the same frozen trio forever. Deterministic:
 * no randomness, no bandit (single-user sparse data cannot train one — 2026-08-28 audit).
 * A no-op when the caller supplies no evidence weights (nothing to be uncertain about), when
 * there is no candidate outside the top two, or when that candidate is already the one with
 * the least evidence — the slot is never spent on a swap that buys no information. */
function withExplorationSlot<T extends Bucketable>(
  ranked: readonly T[],
  hasEvidenceWeights: boolean,
): T[] {
  if (!hasEvidenceWeights || ranked.length <= EXPLORATION_SLOT_INDEX + 1) return [...ranked];
  const head = ranked.slice(0, EXPLORATION_SLOT_INDEX);
  const rest = ranked.slice(EXPLORATION_SLOT_INDEX);
  const evidence = (candidate: T) => candidate.evidenceWeight ?? 0;
  // Strict `<` keeps the incumbent on ties, so the promotion only ever happens when the
  // exploration pick genuinely has thinner evidence than the natural third place.
  const explorer = rest.reduce((best, candidate) =>
    evidence(candidate) < evidence(best) ? candidate : best,
  );
  return [...head, explorer, ...rest.filter((candidate) => candidate !== explorer)];
}
