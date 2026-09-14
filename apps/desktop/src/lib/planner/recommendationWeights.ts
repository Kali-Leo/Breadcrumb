/**
 * Purpose: the recommendation-weight setting's shape and hygiene — the
 * user tunes four intent-level weights; the browsing component is not a knob: it rides the
 * interest weight at the adaptive trust ratio (both signals are "the learner's interest" —
 * one concept, one slider).
 *
 * Every weight is a signed number. The 推荐偏好 card shows each one as a lean in [-1, 1]
 * whose centre is the default: leaning past zero into the negative range does not switch
 * the component off, it reverses it — "already-known helps" becomes "entirely new ground",
 * "lighter" becomes "more challenging" — so both ends of a slider name a result the learner
 * can picture, and the untouched middle is the shipped ranking.
 * Main exports: UserRecommendationWeights, USER_WEIGHT_DEFAULTS, RECOMMENDATION_WEIGHT_MIN,
 * RECOMMENDATION_WEIGHT_MAX, sanitizeRecommendationWeights, weightToLean, leanToWeight.
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

/** Bounds for every recommendation weight. The upper bound ties the goal-gap weight, so a
 * fully leaned slider can match an explicit goal but never outvote it; the lower bound is
 * the mirror image of a full positive lean on the components that default to 1, and gives
 * the difficulty component (default 0.5) exactly as much reach toward "harder" as it has
 * toward "easier". */
export const RECOMMENDATION_WEIGHT_MIN = -1;
export const RECOMMENDATION_WEIGHT_MAX = 2;

/** Each component is clamped to [RECOMMENDATION_WEIGHT_MIN, RECOMMENDATION_WEIGHT_MAX] and
 * falls back to its default when missing or not a finite number. Never throws — bad settings
 * degrade to defaults. A stored table from the brief five-slider era simply has its browsing
 * entry ignored; one from the [0, 2] era is still inside the range. */
export function sanitizeRecommendationWeights(
  stored: Partial<UserRecommendationWeights> | null,
): UserRecommendationWeights {
  const sanitized: UserRecommendationWeights = { ...USER_WEIGHT_DEFAULTS };
  for (const component of Object.keys(sanitized) as (keyof UserRecommendationWeights)[]) {
    const value = stored?.[component];
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[component] = Math.min(
        RECOMMENDATION_WEIGHT_MAX,
        Math.max(RECOMMENDATION_WEIGHT_MIN, value),
      );
    }
  }
  return sanitized;
}

/** A weight as the card shows it: -1 at RECOMMENDATION_WEIGHT_MIN, 0 at the component's
 * default, 1 at RECOMMENDATION_WEIGHT_MAX, piecewise linear in between. The two halves have
 * different scales on purpose — the middle of the slider must BE the default, whatever the
 * default is, or the learner has no way to see that nothing has been changed. */
export function weightToLean(component: keyof UserRecommendationWeights, weight: number): number {
  const base = USER_WEIGHT_DEFAULTS[component];
  const reach = weight < base ? base - RECOMMENDATION_WEIGHT_MIN : RECOMMENDATION_WEIGHT_MAX - base;
  return Math.min(1, Math.max(-1, (weight - base) / reach));
}

/** Inverse of weightToLean — a lean of exactly 0 returns the default weight itself, so the
 * untouched card stores nothing but the shipped table. */
export function leanToWeight(component: keyof UserRecommendationWeights, lean: number): number {
  const base = USER_WEIGHT_DEFAULTS[component];
  const clamped = Math.min(1, Math.max(-1, lean));
  const reach = clamped < 0 ? base - RECOMMENDATION_WEIGHT_MIN : RECOMMENDATION_WEIGHT_MAX - base;
  return base + clamped * reach;
}
