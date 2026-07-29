/**
 * Purpose: token usage -> cost conversion, in integer micro-units of a currency
 * (1 unit = 1/1_000_000 of one USD/CNY) to avoid floating point drift.
 * Main exports: ModelPrice, BUILTIN_MODEL_PRICES, calculateCostMicros, formatCost.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelPrice {
  /** Price per one million input tokens, in whole currency units (e.g. 0.28 = ¥0.28/M). */
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  currency: "USD" | "CNY";
}

/**
 * Fallback prices for common OpenAI-compatible models. Users can override any model's
 * price in settings; unknown models fall back to zero with a UI hint to configure.
 * Verified against provider pricing pages 2026-07-29. We bill input at the cache-miss
 * rate, so the meter is an honest upper bound (cache hits cost the provider-side less).
 */
export const BUILTIN_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-v4-flash": {
    inputPerMillionTokens: 0.14,
    outputPerMillionTokens: 0.28,
    currency: "USD",
  },
  "deepseek-v4-pro": {
    inputPerMillionTokens: 0.435,
    outputPerMillionTokens: 0.87,
    currency: "USD",
  },
};

export function calculateCostMicros(usage: TokenUsage, price: ModelPrice): number {
  const inputMicros = usage.inputTokens * price.inputPerMillionTokens;
  const outputMicros = usage.outputTokens * price.outputPerMillionTokens;
  return Math.round(inputMicros + outputMicros);
}

const CURRENCY_SYMBOLS: Record<ModelPrice["currency"], string> = { USD: "$", CNY: "¥" };

/** Renders micro-units as a short human string, e.g. 12_3400 -> "¥0.1234". */
export function formatCost(costMicros: number, currency: ModelPrice["currency"]): string {
  const units = costMicros / 1_000_000;
  const digits = units >= 1 ? 2 : 4;
  return `${CURRENCY_SYMBOLS[currency]}${units.toFixed(digits)}`;
}
