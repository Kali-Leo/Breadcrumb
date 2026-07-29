/**
 * Purpose: unit tests for cost calculation and formatting.
 */
import { describe, expect, it } from "vitest";
import { calculateCostMicros, formatCost, type ModelPrice } from "./pricing";

const price: ModelPrice = { inputPerMillionTokens: 2, outputPerMillionTokens: 8, currency: "CNY" };

describe("calculateCostMicros", () => {
  it("charges input and output tokens at their own rates", () => {
    // 1000 in-tokens at ¥2/M = 2000 micros; 500 out-tokens at ¥8/M = 4000 micros
    expect(calculateCostMicros({ inputTokens: 1000, outputTokens: 500 }, price)).toBe(6000);
  });

  it("returns zero for zero usage", () => {
    expect(calculateCostMicros({ inputTokens: 0, outputTokens: 0 }, price)).toBe(0);
  });

  it("rounds to whole micros", () => {
    const fractional: ModelPrice = {
      inputPerMillionTokens: 0.27,
      outputPerMillionTokens: 1.1,
      currency: "USD",
    };
    // 3 * 0.27 + 3 * 1.1 = 0.81 + 3.3 = 4.11 -> 4
    expect(calculateCostMicros({ inputTokens: 3, outputTokens: 3 }, fractional)).toBe(4);
  });
});

describe("formatCost", () => {
  it("uses four decimals below one unit", () => {
    expect(formatCost(6000, "CNY")).toBe("¥0.0060");
  });

  it("uses two decimals at one unit or more", () => {
    expect(formatCost(1_230_000, "USD")).toBe("$1.23");
  });
});
