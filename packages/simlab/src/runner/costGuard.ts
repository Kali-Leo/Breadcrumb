/**
 * Purpose: accumulates LLM spend across a run and reports when the CNY budget is exhausted,
 * so the CLI stops LAUNCHING new sessions (sessions already in flight always finish).
 * DeepSeek's builtin prices are USD; the CLI's --budgetCny flag is CNY, so a fixed
 * approximate rate converts between them — this is a rough dev-tooling cost ceiling, not a
 * financial feature, so a hand-set constant is appropriate (no live-rate dependency needed).
 * Main exports: createCostGuard, CostGuard, USD_TO_CNY_RATE.
 */
import { BUILTIN_MODEL_PRICES, calculateCostMicros, type TokenUsage } from "@breadcrumb/core-llm";

/** Approximate, hand-set 2026-08-01 — good enough for a soft budget ceiling. */
export const USD_TO_CNY_RATE = 7.2;

export interface CostGuard {
  /** Records one call's cost; returns that call's cost in micro-CNY for the caller's own log. */
  recordCall(model: string, usage: TokenUsage): number;
  totalCny(): number;
  /** True once recorded spend has reached the budget. */
  isOverBudget(): boolean;
}

export function createCostGuard(budgetCny: number): CostGuard {
  let totalMicrosCny = 0;
  return {
    recordCall(model, usage) {
      const price = BUILTIN_MODEL_PRICES[model];
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
