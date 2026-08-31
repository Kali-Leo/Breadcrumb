/**
 * Purpose: turns the measured purpose catalogue into the one-line "about ¥x per exchange"
 * estimate the spending page shows next to each feature, so a learner can see what a switch
 * will cost before flipping it instead of reading "a small charge each time".
 *
 * The estimate is deliberately conservative in one direction only: it prices every input
 * token as a fresh read, because a first-time reader of that line has no cache history yet.
 * Real bills come in at or under it, and the actual-spend line beside it is the truth once
 * there is any.
 *
 * Main exports: FeatureCostEstimate, estimateFeatureCost.
 */

import type { Currency } from "@breadcrumb/core-llm";
import {
  estimatePurposeCostMicros,
  formatCost,
  PURPOSE_USAGE,
  type PurposeCadence,
  resolveModelRates,
} from "@breadcrumb/core-llm";

export type FeatureCostEstimate =
  /** The model has published rates and this purpose has a measured profile. */
  | { kind: "estimate"; cost: string; cadence: PurposeCadence }
  /** The model is not in the catalogue, so no honest number can be shown. */
  | { kind: "unknown-model" }
  /** Nothing to charge for: the feature makes no LLM calls at all. */
  | { kind: "free" }
  /** The feature calls out, but its prompt has not been measured yet. */
  | { kind: "unmeasured" };

/** The estimate for one settings row, which may cover several metering purposes (the
 * recommendation row bills both interest extraction and self-report mapping, for instance).
 * Costs add up; the cadence shown is the first measured one, since a row's purposes fire
 * together on the same trigger. */
export function estimateFeatureCost(
  purposes: readonly string[],
  model: string,
  currency: Currency | undefined,
): FeatureCostEstimate {
  if (purposes.length === 0) return { kind: "free" };

  const rates = resolveModelRates(model, { currency });
  if (rates === undefined) return { kind: "unknown-model" };

  let totalMicros = 0;
  let cadence: PurposeCadence | undefined;
  for (const purpose of purposes) {
    const micros = estimatePurposeCostMicros(purpose, rates);
    if (micros === undefined) continue;
    totalMicros += micros;
    cadence ??= PURPOSE_USAGE[purpose]?.cadence;
  }
  if (cadence === undefined) return { kind: "unmeasured" };

  return { kind: "estimate", cost: formatCost(totalMicros, rates.currency), cadence };
}
