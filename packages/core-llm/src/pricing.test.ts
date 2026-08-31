/**
 * Purpose: unit tests for the cost maths over the model catalogue — which rate card applies
 * (currency, peak vs off-peak), how cached input tokens are billed, and formatting.
 */
import { describe, expect, it } from "vitest";
import {
  calculateCostMicros,
  formatCost,
  type ModelRates,
  modelCurrencies,
  modelDeferralSaves,
  resolveModelRates,
} from "./pricing";

const rates: ModelRates = {
  currency: "CNY",
  inputPerMillionTokens: 2,
  cachedInputPerMillionTokens: 0.1,
  outputPerMillionTokens: 8,
};

/** Inside DeepSeek's peak window: a Monday at 02:00 UTC. */
const PEAK = new Date("2026-08-31T02:00:00Z");
/** Outside it: the same Monday at 12:00 UTC, and any hour of the weekend. */
const OFF_PEAK = new Date("2026-08-31T12:00:00Z");
const WEEKEND = new Date("2026-08-30T02:00:00Z");

describe("calculateCostMicros", () => {
  it("charges input and output tokens at their own rates", () => {
    // 1000 in-tokens at ¥2/M = 2000 micros; 500 out-tokens at ¥8/M = 4000 micros
    expect(calculateCostMicros({ inputTokens: 1000, outputTokens: 500 }, rates)).toBe(6000);
  });

  it("bills the cached slice of the prompt at the cache-hit rate", () => {
    // 800 of the 1000 in-tokens came from the prefix cache: 200*2 + 800*0.1 = 480 micros
    const usage = { inputTokens: 1000, outputTokens: 0, cachedInputTokens: 800 };
    expect(calculateCostMicros(usage, rates)).toBe(480);
  });

  it("bills the whole prompt fresh when the provider reported no split", () => {
    expect(calculateCostMicros({ inputTokens: 1000, outputTokens: 0 }, rates)).toBe(2000);
  });

  it("never lets a reported cache hit exceed the prompt it came from", () => {
    const usage = { inputTokens: 100, outputTokens: 0, cachedInputTokens: 9999 };
    expect(calculateCostMicros(usage, rates)).toBe(10); // all 100 at the cached rate
  });

  it("falls back to the fresh rate when a provider reports hits but publishes no cached rate", () => {
    const noCacheRate: ModelRates = { ...rates, cachedInputPerMillionTokens: undefined };
    const usage = { inputTokens: 1000, outputTokens: 0, cachedInputTokens: 800 };
    expect(calculateCostMicros(usage, noCacheRate)).toBe(2000);
  });

  it("returns zero for zero usage", () => {
    expect(calculateCostMicros({ inputTokens: 0, outputTokens: 0 }, rates)).toBe(0);
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

describe("modelCurrencies", () => {
  it("lists every currency a model is sold in", () => {
    expect(modelCurrencies("deepseek-v4-flash")).toEqual(["CNY", "USD"]);
  });

  it("is empty for a model with no catalogue entry, so nobody is asked to pick", () => {
    expect(modelCurrencies("some-self-hosted-model")).toEqual([]);
  });
});

describe("resolveModelRates", () => {
  it("bills a multi-currency model in the currency the account is on", () => {
    expect(resolveModelRates("deepseek-v4-flash", { currency: "USD", at: PEAK })).toEqual({
      currency: "USD",
      inputPerMillionTokens: 0.44,
      cachedInputPerMillionTokens: 0.014,
      outputPerMillionTokens: 1.32,
    });
  });

  it("halves every rate outside the peak window", () => {
    const offPeak = resolveModelRates("deepseek-v4-flash", { currency: "CNY", at: OFF_PEAK });
    expect(offPeak).toEqual({
      currency: "CNY",
      inputPerMillionTokens: 1.5,
      cachedInputPerMillionTokens: 0.05,
      outputPerMillionTokens: 4.5,
    });
  });

  it("treats the whole weekend as off-peak even inside peak hours", () => {
    const weekend = resolveModelRates("deepseek-v4-flash", { currency: "CNY", at: WEEKEND });
    expect(weekend?.inputPerMillionTokens).toBe(1.5);
  });

  it("falls back to the first listed currency when nobody has chosen", () => {
    expect(resolveModelRates("deepseek-v4-pro", { at: PEAK })?.currency).toBe("CNY");
  });

  it("never invents a rate in a currency the provider does not sell the model in", () => {
    const price = resolveModelRates("deepseek-v4-pro", { currency: "USD", at: PEAK });
    expect(price?.currency).toBe("USD");
    expect(price?.inputPerMillionTokens).toBe(1.32);
  });

  it("returns nothing for an unknown model instead of guessing", () => {
    expect(resolveModelRates("some-self-hosted-model", { currency: "CNY" })).toBeUndefined();
  });
});

describe("modelDeferralSaves", () => {
  it("is true for a model that prices by time of day", () => {
    expect(modelDeferralSaves("deepseek-v4-flash")).toBe(true);
  });

  it("is false for a model we have no prices for, so no switch is offered", () => {
    expect(modelDeferralSaves("some-self-hosted-model")).toBe(false);
  });
});
