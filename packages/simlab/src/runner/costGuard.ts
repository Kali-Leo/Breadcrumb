/**
 * Purpose: accumulates LLM spend across a run and reports when the CNY budget is exhausted,
 * so the CLI stops LAUNCHING new sessions (sessions already in flight always finish).
 * Models sold in CNY are billed at their CNY rate directly; anything priced only in another
 * currency goes through a fixed approximate rate — this is a rough dev-tooling cost ceiling,
 * not a financial feature, so a hand-set constant is appropriate (no live-rate dependency).
 * A model the built-in catalogue has never heard of (every candidate in the model bench but
 * DeepSeek) can be priced through the optional `fallbackRates` resolver, so a run against
 * outside providers is still capped rather than silently unbounded.
 * Main exports: createCostGuard, CostGuard, USD_TO_CNY_RATE.
 */
import {
  calculateCostMicros,
  type ModelRates,
  resolveModelRates,
  type TokenUsage,
} from "@breadcrumb/core-llm";

/** Approximate, hand-set — good enough for a soft budget ceiling. */
export const USD_TO_CNY_RATE = 7.2;

export interface CostGuard {
  /** Records one call's cost; returns that call's cost in micro-CNY for the caller's own log. */
  recordCall(model: string, usage: TokenUsage): number;
  totalCny(): number;
  /** True once recorded spend has reached the budget. */
  isOverBudget(): boolean;
}

export function createCostGuard(
  budgetCny: number,
  /** Rates for a model the catalogue does not carry. Returning undefined leaves that model
   * uncounted, exactly as before. */
  fallbackRates?: (model: string) => ModelRates | undefined,
): CostGuard {
  let totalMicrosCny = 0;
  return {
    recordCall(model, usage) {
      // The budget is CNY, so ask for the CNY price first — DeepSeek publishes one, which
      // makes the guard exact instead of routed through the approximate rate below.
      const price = resolveModelRates(model, { currency: "CNY" }) ?? fallbackRates?.(model);
      if (price === undefined) return 0;
      const costMicros = calculateCostMicros(usage, price);
      const microsCny = price.currency === "CNY" ? costMicros : costMicros * USD_TO_CNY_RATE;
      totalMicrosCny += microsCny;
      return microsCny;
    },
    totalCny() {
      return totalMicrosCny / 1_000_000;
    },
    isOverBudget() {
      return totalMicrosCny / 1_000_000 >= budgetCny;
    },
  };
}
