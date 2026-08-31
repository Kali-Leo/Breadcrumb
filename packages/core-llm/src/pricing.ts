/**
 * Purpose: token usage -> cost conversion, in integer micro-units of a currency
 * (1 unit = 1/1_000_000 of one USD/CNY) to avoid floating point drift, plus the builtin
 * price table and the rule for picking which of a model's prices applies.
 * Main exports: Currency, ModelPrice, ModelPrices, BUILTIN_MODEL_PRICES, modelCurrencies,
 * resolveModelPrice, calculateCostMicros, formatCost.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type Currency = "USD" | "CNY";

export interface ModelPrice {
  /** Price per one million input tokens, in whole currency units (e.g. 3 = ¥3/M). */
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  currency: Currency;
}

/** A model's prices, one entry per currency the provider sells it in — never empty. */
export type ModelPrices = readonly [ModelPrice, ...ModelPrice[]];

/**
 * Builtin prices for common OpenAI-compatible models. The currency is the provider's fact,
 * never a typed-in preference: a model sold in one currency has a single entry and nothing
 * to ask about, and a model sold in several lists them all so the account holder can say
 * which platform their key belongs to (settings → AI service). A model with no entry costs
 * nothing rather than being priced at a guess.
 *
 * Verified against api-docs.deepseek.com's English and 简体中文 pricing pages, 2026-08-31:
 * DeepSeek sells both models in CNY on its China platform and in USD internationally.
 * Since 2026-08-16 they are billed at peak/off-peak rates (off-peak is half of peak); the
 * rates below are the PEAK ones, and input is billed at the cache-miss rate, so the meter
 * stays an honest upper bound — it may overstate a bill, but it never tells someone they
 * spent less than they actually did.
 */
export const BUILTIN_MODEL_PRICES: Readonly<Record<string, ModelPrices>> = {
  "deepseek-v4-flash": [
    { inputPerMillionTokens: 3, outputPerMillionTokens: 9, currency: "CNY" },
    { inputPerMillionTokens: 0.44, outputPerMillionTokens: 1.32, currency: "USD" },
  ],
  "deepseek-v4-pro": [
    { inputPerMillionTokens: 9, outputPerMillionTokens: 27, currency: "CNY" },
    { inputPerMillionTokens: 1.32, outputPerMillionTokens: 3.96, currency: "USD" },
  ],
};

/** The currencies a model is sold in — empty for a model with no builtin price. More than
 * one entry is the only case where anybody needs to be asked which currency applies. */
export function modelCurrencies(model: string): readonly Currency[] {
  return BUILTIN_MODEL_PRICES[model]?.map((price) => price.currency) ?? [];
}

/** The price to bill a model at. `preferred` only chooses between the currencies the model
 * is actually sold in; asking for one the provider does not offer falls back to the first
 * listed price rather than inventing a rate in that currency. */
export function resolveModelPrice(model: string, preferred?: Currency): ModelPrice | undefined {
  const prices = BUILTIN_MODEL_PRICES[model];
  if (prices === undefined) return undefined;
  return prices.find((price) => price.currency === preferred) ?? prices[0];
}

export function calculateCostMicros(usage: TokenUsage, price: ModelPrice): number {
  const inputMicros = usage.inputTokens * price.inputPerMillionTokens;
  const outputMicros = usage.outputTokens * price.outputPerMillionTokens;
  return Math.round(inputMicros + outputMicros);
}

const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: "$", CNY: "¥" };

/** Renders micro-units as a short human string, e.g. 12_3400 -> "¥0.1234". */
export function formatCost(costMicros: number, currency: Currency): string {
  const units = costMicros / 1_000_000;
  const digits = units >= 1 ? 2 : 4;
  return `${CURRENCY_SYMBOLS[currency]}${units.toFixed(digits)}`;
}
