/**
 * Purpose: unit tests for the cost guard's accumulation and over-budget detection.
 */
import { describe, expect, it } from "vitest";
import { createCostGuard, USD_TO_CNY_RATE } from "./costGuard";

describe("createCostGuard", () => {
  it("starts under budget with zero spend", () => {
    const guard = createCostGuard(5);
    expect(guard.totalCny()).toBe(0);
    expect(guard.isOverBudget()).toBe(false);
  });

  it("converts USD-priced model usage into CNY via the fixed rate", () => {
    const guard = createCostGuard(1000);
    // deepseek-v4-flash: $0.14/M in, $0.28/M out (USD).
    guard.recordCall("deepseek-v4-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const expectedUsd = 0.14 + 0.28;
    expect(guard.totalCny()).toBeCloseTo(expectedUsd * USD_TO_CNY_RATE, 4);
  });

  it("becomes over-budget once accumulated spend reaches the budget", () => {
    const guard = createCostGuard(0.01);
    expect(guard.isOverBudget()).toBe(false);
    guard.recordCall("deepseek-v4-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(guard.isOverBudget()).toBe(true);
  });

  it("records zero cost for an unknown model instead of throwing", () => {
    const guard = createCostGuard(5);
    const cost = guard.recordCall("unknown-model", { inputTokens: 100, outputTokens: 100 });
    expect(cost).toBe(0);
    expect(guard.totalCny()).toBe(0);
  });
});
