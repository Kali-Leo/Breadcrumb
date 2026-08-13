/**
 * Purpose: personal FSRS fitting trigger (vision/09 #1) — once the diglot review log
 * clears the data threshold, runs the Rust fsrs-rs optimizer in the background and
 * persists the 21 personalized parameters; refitting happens every +100 reviews.
 * Side effects: Tauri invoke, settings write. Fails soft into ai_failures.
 * Main exports: maybeFitFsrsParameters, REFIT_REVIEW_STEP.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import {
  buildTrainingItems,
  configureDiglotScheduler,
  MIN_REVIEWS_FOR_FITTING,
} from "@breadcrumb/plugin-diglot-weave";
import { invoke } from "@tauri-apps/api/core";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";

/** Refit only after this many additional reviews — fitting is cheap but not free. */
export const REFIT_REVIEW_STEP = 100;

/** Fits when warranted; returns the new parameters (also applied to the scheduler) or
 * null when below threshold / not yet due for a refit. */
export async function maybeFitFsrsParameters(
  pair: DiglotPairId,
  lastFittedReviewCount: number,
): Promise<{ params: number[]; reviewCount: number } | null> {
  const repos = await getRepos();
  const events = await repos.diglot.listAllEvents(pair);
  const { items, reviewCount } = buildTrainingItems(events);
  if (reviewCount < MIN_REVIEWS_FOR_FITTING) return null;
  if (reviewCount < lastFittedReviewCount + REFIT_REVIEW_STEP) return null;
  try {
    const params = await invoke<number[]>("optimize_fsrs_parameters", { items });
    configureDiglotScheduler(params);
    return { params, reviewCount };
  } catch (error) {
    void recordAiFailure("fsrs-fitting", error);
    return null;
  }
}
