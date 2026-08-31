/**
 * Purpose: the recommendation-weight setting's value hygiene (spec 060 §3) — slider bounds
 * and the sanitizer that lets a stored table survive schema drift and hand edits.
 * Main exports: sanitizeRecommendationWeights, RECOMMENDATION_WEIGHT_MAX.
 */
import { FRONTIER_WEIGHTS, type FrontierWeights } from "@breadcrumb/plugin-planner";

/** Slider upper bound for every recommendation weight (lower bound is 0). */
export const RECOMMENDATION_WEIGHT_MAX = 2;

/** Each component is clamped to [0, RECOMMENDATION_WEIGHT_MAX] and falls back to its default
 * when missing or not a finite number. Never throws — bad settings degrade to defaults. */
export function sanitizeRecommendationWeights(
  stored: Partial<FrontierWeights> | null,
): FrontierWeights {
  const sanitized: FrontierWeights = { ...FRONTIER_WEIGHTS };
  for (const component of Object.keys(sanitized) as (keyof FrontierWeights)[]) {
    const value = stored?.[component];
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[component] = Math.min(RECOMMENDATION_WEIGHT_MAX, Math.max(0, value));
    }
  }
  return sanitized;
}
