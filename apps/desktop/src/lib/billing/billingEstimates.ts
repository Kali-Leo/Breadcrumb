/**
 * Purpose: works out the one-line "about ¥x per exchange" estimate the spending page shows
 * next to each feature, so a learner can see what a switch will cost before flipping it
 * instead of reading "a small charge each time".
 *
 * Where the token numbers come from, in order:
 *   1. the learner's own ledger (llm_calls), averaged per purpose for the model in use —
 *      the provider's own reported usage, so it includes whatever the model spent thinking;
 *   2. the measured purpose catalogue, when the ledger has too few calls of that purpose to
 *      average. That catalogue converts the real prompt and a typical reply into tokens and
 *      counts no thinking at all, so on a model that bills its thinking as output tokens it
 *      lands well under the real bill — which is exactly why the ledger wins when there is
 *      one. Rates are always today's rates; only the token counts differ.
 *
 * A purpose the catalogue has never measured can still be priced from the ledger alone, as
 * long as PURPOSE_CADENCE says what one call is "per" — a number with no unit is not an
 * estimate. With neither a ledger average nor a measured profile, the row says so.
 *
 * Main exports: FeatureCostEstimate, LEDGER_MIN_SAMPLES, estimateFeatureCost.
 */

import type { PurposeAverageUsage } from "@breadcrumb/core-db";
import type { Currency, ModelRates } from "@breadcrumb/core-llm";
import {
  calculateCostMicros,
  estimatePurposeCostMicros,
  formatCost,
  PURPOSE_CADENCE,
  PURPOSE_USAGE,
  type PurposeCadence,
  resolveModelRates,
} from "@breadcrumb/core-llm";

/** How many recorded calls a purpose needs before its own average is trusted over the
 * catalogue. Two calls of one purpose can differ by an order of magnitude; three is the
 * smallest count that stops a single outlier from being the whole estimate. */
export const LEDGER_MIN_SAMPLES = 3;

/** Average usage per purpose, for the model the estimate is being made for. */
export type PurposeAverages = ReadonlyMap<string, PurposeAverageUsage>;

export type FeatureCostEstimate =
  /** The model has published rates and this purpose has a token profile. */
  | {
      kind: "estimate";
      cost: string;
      cadence: PurposeCadence;
      /** Where the token counts came from — the account's own calls, or the catalogue. */
      source: "ledger" | "catalogue";
      /** Recorded calls behind a ledger estimate (the smallest count when a row covers
       * several purposes); 0 when the estimate came from the catalogue. */
      samples: number;
    }
  /** The model is not in the catalogue, so no honest number can be shown. */
  | { kind: "unknown-model" }
  /** Nothing to charge for: the feature makes no LLM calls at all. */
  | { kind: "free" }
  /** The feature calls out, but its prompt has not been measured yet. */
  | { kind: "unmeasured" };

/** The account's own average for this purpose, or undefined when there are too few calls. */
function ledgerUsageOf(
  purpose: string,
  ledger: PurposeAverages | undefined,
): PurposeAverageUsage | undefined {
  const average = ledger?.get(purpose);
  if (average === undefined || average.samples < LEDGER_MIN_SAMPLES) return undefined;
  return average;
}

/** The estimate for one settings row, which may cover several metering purposes (the
 * recommendation row bills both interest extraction and self-report mapping, for instance).
 * Costs add up; the cadence shown is the first known one, since a row's purposes fire
 * together on the same trigger. `ledger` holds the account's own averages for `model`. */
export function estimateFeatureCost(
  purposes: readonly string[],
  pricing: { model: string; currency?: Currency; override?: ModelRates },
  ledger?: PurposeAverages,
): FeatureCostEstimate {
  if (purposes.length === 0) return { kind: "free" };

  const rates = resolveModelRates(pricing.model, {
    currency: pricing.currency,
    override: pricing.override,
  });
  if (rates === undefined) return { kind: "unknown-model" };

  let totalMicros = 0;
  let cadence: PurposeCadence | undefined;
  let samples: number | undefined;
  for (const purpose of purposes) {
    // Cadence never comes from the ledger: it knows what a call cost, not how often the
    // feature fires, and a cost with no "per what" is not worth showing.
    const purposeCadence = PURPOSE_USAGE[purpose]?.cadence ?? PURPOSE_CADENCE[purpose];
    if (purposeCadence === undefined) continue;
    const average = ledgerUsageOf(purpose, ledger);
    if (average !== undefined) {
      totalMicros += calculateCostMicros(
        {
          inputTokens: average.inputTokens,
          outputTokens: average.outputTokens,
          cachedInputTokens: average.cachedInputTokens,
        },
        rates,
      );
      samples = samples === undefined ? average.samples : Math.min(samples, average.samples);
    } else {
      // Cadence-only purposes have no token profile to fall back on. Skip them rather than
      // adding a zero, which would quietly understate the row.
      const catalogueMicros = estimatePurposeCostMicros(purpose, rates);
      if (catalogueMicros === undefined) continue;
      totalMicros += catalogueMicros;
    }
    cadence ??= purposeCadence;
  }
  if (cadence === undefined) return { kind: "unmeasured" };

  return {
    kind: "estimate",
    cost: formatCost(totalMicros, rates.currency),
    cadence,
    source: samples === undefined ? "catalogue" : "ledger",
    samples: samples ?? 0,
  };
}
