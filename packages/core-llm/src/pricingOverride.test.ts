/**
 * Purpose: the learner's own rate card — when they have entered prices, those are the prices,
 * whatever the built-in catalogue says and whatever time of day it is.
 */
import { describe, expect, it } from "vitest";
import { calculateCostMicros, resolveModelRates } from "./pricing";

const MINE = {
  currency: "USD",
  inputPerMillionTokens: 1.5,
  outputPerMillionTokens: 6,
} as const;

describe("prices the learner entered", () => {
  it("answers for a model the catalogue has never heard of", () => {
    expect(resolveModelRates("some-local-model", {})).toBeUndefined();
    expect(resolveModelRates("some-local-model", { override: MINE })).toEqual(MINE);
  });

  it("wins over the catalogue, and over its peak/off-peak schedule", () => {
    const peak = new Date("2026-09-01T10:00:00Z");
    const night = new Date("2026-09-01T20:00:00Z");
    for (const at of [peak, night]) {
      expect(resolveModelRates("deepseek-v4-flash", { override: MINE, at })).toEqual(MINE);
    }
  });

  it("prices a call with them", () => {
    const rates = resolveModelRates("some-local-model", { override: MINE });
    expect(rates).toBeDefined();
    if (rates === undefined) return;
    // 1M input + 1M output at 1.5 + 6 per million.
    expect(calculateCostMicros({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, rates)).toBe(
      7_500_000,
    );
  });

  it("bills cache hits at the fresh rate when no cached price was entered", () => {
    const rates = resolveModelRates("some-local-model", { override: MINE });
    if (rates === undefined) return;
    const withCache = calculateCostMicros(
      { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 900_000 },
      rates,
    );
    expect(withCache).toBe(1_500_000);
  });
});
