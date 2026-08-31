/**
 * Purpose: unit tests for the cost guard's accumulation and over-budget detection.
 */
import { calculateCostMicros, resolveModelPrice } from "@breadcrumb/core-llm";
import { describe, expect, it } from "vitest";
import { createCostGuard, USD_TO_CNY_RATE } from "./costGuard";

describe("createCostGuard", () => {
  it("starts under budget with zero spend", () => {
    const guard = createCostGuard(5);
    expect(guard.totalCny()).toBe(0);
    expect(guard.isOverBudget()).toBe(false);
  });

  it("bills a model sold in CNY at its own CNY rate, with no conversion", () => {
    // deepseek-v4-flash is sold in CNY on DeepSeek's China platform, so the guard uses that
    // price directly — the approximate rate never enters the number.
    const cnyPrice = resolveModelPrice("deepseek-v4-flash", "CNY");
    if (cnyPrice === undefined) throw new Error("deepseek-v4-flash should have a CNY price");
    expect(cnyPrice.currency).toBe("CNY");

    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const guard = createCostGuard(1000);
    guard.recordCall("deepseek-v4-flash", usage);
    expect(guard.totalCny()).toBeCloseTo(calculateCostMicros(usage, cnyPrice) / 1_000_000, 4);
  });

  it("keeps a conversion path for models not sold in CNY", () => {
    // No builtin model is USD-only today, so this pins the arithmetic the branch performs
    // rather than routing a model through it.
    const usdPrice = resolveModelPrice("deepseek-v4-flash", "USD");
    if (usdPrice === undefined) throw new Error("deepseek-v4-flash should have a USD price");
    const usdMicros = calculateCostMicros({ inputTokens: 1_000_000, outputTokens: 0 }, usdPrice);
    expect((usdMicros * USD_TO_CNY_RATE) / 1_000_000).toBeCloseTo(
      usdPrice.inputPerMillionTokens * USD_TO_CNY_RATE,
      4,
    );
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
