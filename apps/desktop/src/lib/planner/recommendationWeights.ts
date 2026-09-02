/**
 * Purpose: the recommendation-weight setting's shape and hygiene (spec 060 §3+§5) — the
 * user tunes four intent-level weights; the browsing component is not a knob: it rides the
 * interest weight at the adaptive trust ratio (both signals are "the learner's interest",
 * Leo 2026-08-31 — one concept, one slider).
 * Main exports: UserRecommendationWeights, USER_WEIGHT_DEFAULTS, RECOMMENDATION_WEIGHT_MAX,
 * sanitizeRecommendationWeights.
 */
import { FRONTIER_WEIGHTS, type FrontierWeights } from "@breadcrumb/feature-planner";

/** What the learner actually controls — everything but the derived browsing weight. */
export type UserRecommendationWeights = Omit<FrontierWeights, "browsing">;

export const USER_WEIGHT_DEFAULTS: UserRecommendationWeights = {
  helps: FRONTIER_WEIGHTS.helps,
  interest: FRONTIER_WEIGHTS.interest,
  difficulty: FRONTIER_WEIGHTS.difficulty,
  goalGap: FRONTIER_WEIGHTS.goalGap,
};

/** Slider upper bound for every recommendation weight (lower bound is 0). */
export const RECOMMENDATION_WEIGHT_MAX = 2;

/** Each component is clamped to [0, RECOMMENDATION_WEIGHT_MAX] and falls back to its default
 * when missing or not a finite number. Never throws — bad settings degrade to defaults.
 * A stored table from the brief five-slider era simply has its browsing entry ignored. */
export function sanitizeRecommendationWeights(
  stored: Partial<UserRecommendationWeights> | null,
): UserRecommendationWeights {
  const sanitized: UserRecommendationWeights = { ...USER_WEIGHT_DEFAULTS };
  for (const component of Object.keys(sanitized) as (keyof UserRecommendationWeights)[]) {
    const value = stored?.[component];
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[component] = Math.min(RECOMMENDATION_WEIGHT_MAX, Math.max(0, value));
    }
  }
  return sanitized;
}
