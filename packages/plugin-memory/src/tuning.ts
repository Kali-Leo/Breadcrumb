/**
 * Purpose: single documented index of every tunable constant across the knowledge-net
 * plugins (spec 014 #5) — re-exports each constant from the package that actually owns it
 * (imports for plugin-interest/plugin-graph/plugin-planner values; local re-exports for
 * plugin-memory's own). Nothing here is a new value or a new behavior: every pure function
 * still takes its parameters by injection, so a future per-user override only has to change
 * what gets passed in, never this file's shape.
 * Main exports: userModelParams, productParams.
 */
import {
  ALIGNMENT_CANDIDATE_THRESHOLD,
  ALIGNMENT_JUDGE_BATCH_SIZE,
  ALIGNMENT_TOP_K,
} from "@breadcrumb/plugin-compare";
import {
  ADJACENT_CONCEPT_EDGE_CONFIDENCE,
  DEFAULT_FALLBACK_RECENT_N,
  DEFAULT_TOP_K_SIMILAR,
  HELPS_WEIGHT_SCORES,
} from "@breadcrumb/plugin-graph";
import {
  CONFIDENCE_LEVEL_SCORES,
  DEFAULT_SPREAD_FACTOR,
  INTEREST_HALF_LIFE_DAYS,
  INTEREST_LEVEL_SCORES,
  K_PSEUDO,
} from "@breadcrumb/plugin-interest";
import { SYNONYM_SIMILARITY_THRESHOLD } from "@breadcrumb/plugin-knowledge-tree";
import {
  GOAL_GAP_SCORE_BOOST,
  LADDER_REFRESH_MAX_HOURS,
  LADDER_REFRESH_MIN_HOURS,
  MILESTONE_DIM_DISCOUNT,
  MILESTONE_DIM_WEIGHT,
  MILESTONE_LIT_WEIGHT,
  PROPAGATION_INHERIT_FACTOR,
  PROPAGATION_INTEREST_THRESHOLD,
  ROUTE_INTEREST_CHIP_THRESHOLD,
} from "@breadcrumb/plugin-planner";
import { CLAIM_HALF_LIFE_DAYS, CLAIM_WEIGHT, DIM_THRESHOLD, LIT_THRESHOLD } from "./mastery";

/**
 * Parameters that describe a facet of THIS learner's own forgetting/interest curve. They are
 * fixed defaults today, shared by every user; each is a legitimate future candidate for
 * per-user learning (e.g. fit from that user's own review history) once spec work exists for
 * it. Nothing here builds that adaptation now — this is only the index.
 */
export const userModelParams = {
  /** ts-fsrs's own scheduling parameters (packages/plugin-memory/src/retention.ts calls
   * `fsrs()` with no overrides, i.e. the library defaults) — the single biggest future
   * per-user adaptation target: a learner's real forgetting curve rarely matches the
   * population default. Not a plain constant, so it isn't re-exported by value here; see
   * retention.ts's `fsrs()` call site to override it. */
  fsrsParametersNote:
    "ts-fsrs defaults via fsrs() in retention.ts — override there once per-user fitting exists",
  /** Self-report claim half-life (days): how fast "我学过 X" fades if never revisited by a
   * real footprint. A learner who reliably over/under-claims is a per-user signal. */
  claimHalfLifeDays: CLAIM_HALF_LIFE_DAYS,
  /** Interest-signal half-life (days): how fast curiosity/confusion/boredom evidence fades.
   * A learner whose interests are unusually stable or volatile could shift this. */
  interestHalfLifeDays: INTEREST_HALF_LIFE_DAYS,
} as const;

/**
 * Fixed product-tuning constants — thresholds and weights chosen for the product as a whole,
 * not modeling any one learner. Still worth centralizing so a future tuning pass touches one
 * file's worth of documentation instead of hunting through every package.
 */
export const productParams = {
  /** Mastery value at/above which a node counts as "lit" (fully learned) / "dim" (partially
   * seen) in the three-tier mastery display. plugin-memory/mastery.ts. */
  litThreshold: LIT_THRESHOLD,
  dimThreshold: DIM_THRESHOLD,
  /** Self-report claim strength by level — "learned" outweighs "familiar", but neither can
   * ever outweigh a real footprint. plugin-memory/mastery.ts. */
  claimWeight: CLAIM_WEIGHT,
  /** Shrinkage pseudo-count for aggregateInterest: how many "prior" signals a node's real
   * evidence must outweigh before its score approaches the raw average. plugin-interest/
   * aggregate.ts. */
  interestShrinkagePseudoCount: K_PSEUDO,
  /** How much of the embedding-neighborhood average bleeds into a node with no direct
   * interest signal. plugin-interest/spread.ts. */
  interestSpreadFactor: DEFAULT_SPREAD_FACTOR,
  /** Anchored-tier -> number maps the LLM extraction/judging prompts are built around, so a
   * label like "强" always means the same 0.9 everywhere it's asked for (spec 014 #1).
   * plugin-interest/extraction.ts, plugin-graph/edgeJudge.ts. */
  interestLevelScores: INTEREST_LEVEL_SCORES,
  confidenceLevelScores: CONFIDENCE_LEVEL_SCORES,
  helpsWeightScores: HELPS_WEIGHT_SCORES,
  /** Edge-candidate ranking pool sizes (embedding top-K, and the no-embeddings-yet fallback
   * pool). plugin-graph/similarity.ts. */
  topKSimilar: DEFAULT_TOP_K_SIMILAR,
  fallbackRecentN: DEFAULT_FALLBACK_RECENT_N,
  /** One-hop reverse interest propagation (spec 014 #4): the minimum interest a locked node
   * needs before it lends any to its prerequisites, and how much of it they inherit.
   * plugin-planner/propagate.ts. */
  propagationInterestThreshold: PROPAGATION_INTEREST_THRESHOLD,
  propagationInheritFactor: PROPAGATION_INHERIT_FACTOR,
  /** Node-dedup synonym gate (spec 015): cosine-similarity floor a would-be-new node's best
   * existing match must clear before it costs one LLM verdict call.
   * plugin-knowledge-tree/synonymGate.ts. */
  synonymSimilarityThreshold: SYNONYM_SIMILARITY_THRESHOLD,
  /** Casual-mode adjacent-concept proposals (spec 016) carry no separate confidence tier —
   * this fixed mid value keeps their helps edge from silently outweighing an
   * explicitly-judged one. plugin-graph/plan.ts. */
  adjacentConceptEdgeConfidence: ADJACENT_CONCEPT_EDGE_CONFIDENCE,
  /** Ranked-mode frontier boost (spec 016): flat score bonus for a candidate inside the
   * selected goal's gap. plugin-planner/frontier.ts. */
  goalGapScoreBoost: GOAL_GAP_SCORE_BOOST,
  /** Milestone formula weights (spec 016): 0.8 x litFraction + 0.2 x dimFraction x 0.5.
   * plugin-planner/milestone.ts. */
  milestoneLitWeight: MILESTONE_LIT_WEIGHT,
  milestoneDimWeight: MILESTONE_DIM_WEIGHT,
  milestoneDimDiscount: MILESTONE_DIM_DISCOUNT,
  /** Single-route recommendation (spec 017): interest score a route step needs before the
   * lab UI's "兴趣" reason chip shows. plugin-planner/recommendRoute.ts. */
  routeInterestChipThreshold: ROUTE_INTEREST_CHIP_THRESHOLD,
  /** Ladder assessment-cache expiry window (spec 022) — a stored board lives a uniform-random
   * stretch inside this range before the next view re-assesses. Cache pacing only: the ladder
   * carries no ranking mechanism at all. plugin-planner/ladderRefresh.ts. */
  ladderRefreshMinHours: LADDER_REFRESH_MIN_HOURS,
  ladderRefreshMaxHours: LADDER_REFRESH_MAX_HOURS,
  /** Comparison-tree semantic alignment (spec 024): local-embedding recall floor (wider than
   * the synonym gate's 0.85 — the LLM judge restores precision), candidates per profile leaf,
   * and pairs per batched judge call. plugin-compare/alignment.ts. */
  alignmentCandidateThreshold: ALIGNMENT_CANDIDATE_THRESHOLD,
  alignmentTopK: ALIGNMENT_TOP_K,
  alignmentJudgeBatchSize: ALIGNMENT_JUDGE_BATCH_SIZE,
} as const;
