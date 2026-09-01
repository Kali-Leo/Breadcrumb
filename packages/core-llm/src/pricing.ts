/**
 * Purpose: the cost maths over the model catalogue — resolving which rate card applies to
 * one call (currency, time of day, deferred or not) and turning token usage into integer
 * micro-units of that currency (1 unit = 1/1_000_000) to avoid floating point drift.
 * The rates themselves live in modelCatalogue.ts; nothing here hard-codes a number.
 * Main exports: TokenUsage, modelCurrencies, resolveModelRates, calculateCostMicros,
 * formatCost, deferralSaves.
 */
import { type Currency, effectiveRates, MODEL_CATALOGUE, type ModelRates } from "./modelCatalogue";

export type { Currency, ModelRates } from "./modelCatalogue";
export { deferralSaves, isPeakHour, MODEL_CATALOGUE } from "./modelCatalogue";

export interface TokenUsage {
  /** Every prompt token the provider counted, cached ones included. */
  inputTokens: number;
  outputTokens: number;
  /** The slice of inputTokens the provider served from its prefix cache, when it says so.
   * Undefined means the provider did not report a split, so the whole prompt is billed at
   * the fresh rate — an over-estimate, never an under-estimate. */
  cachedInputTokens?: number;
}

/** How one call should be priced beyond the model name. */
export interface RateContext {
  /** Which currency the account is billed in, for models sold in several. */
  currency?: Currency;
  /** When the call happens — decides peak vs off-peak. Defaults to now. */
  at?: Date;
  /** Whether the call went to a deferred/batch endpoint. */
  deferred?: boolean;
  /**
   * Prices the learner typed in themselves, for a model the built-in catalogue has never
   * heard of (or whose published price has moved). Taken exactly as given: no peak/off-peak
   * multiplier and no batch discount, because those are properties of a price list we do not
   * have. It wins over the catalogue — someone who went to the trouble of entering their own
   * numbers is telling us the catalogue is wrong for them.
   */
  override?: ModelRates;
}

/** The currencies a model is sold in — empty for a model with no catalogue entry. More than
 * one is the only case where anybody needs to be asked which currency applies. */
export function modelCurrencies(model: string): readonly Currency[] {
  return MODEL_CATALOGUE[model]?.rates.map((rate) => rate.currency) ?? [];
}

/** The rate card in force for one call, or undefined for a model we have no prices for.
 * `currency` only chooses between the currencies the model is actually sold in; asking for
 * one the provider does not offer falls back to the first listed rather than inventing a
 * rate in that currency. */
export function resolveModelRates(
  model: string,
  context: RateContext = {},
): ModelRates | undefined {
  if (context.override !== undefined) return context.override;
  const entry = MODEL_CATALOGUE[model];
  if (entry === undefined) return undefined;
  const base = entry.rates.find((rate) => rate.currency === context.currency) ?? entry.rates[0];
  return effectiveRates(entry, base, { at: context.at ?? new Date(), deferred: context.deferred });
}

/** Whether deferring this model's background work would save anything at all — the condition
 * for offering the learner that switch. False for a model we have no prices for. */
export function modelDeferralSaves(model: string): boolean {
  const entry = MODEL_CATALOGUE[model];
  if (entry === undefined) return false;
  return entry.batchMultiplier !== undefined || entry.offPeak !== undefined;
}

export function calculateCostMicros(usage: TokenUsage, rates: ModelRates): number {
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  // A provider that reports cache hits but publishes no cached rate would otherwise bill
  // them free; fall back to the fresh rate so the meter never under-states.
  const cachedRate = rates.cachedInputPerMillionTokens ?? rates.inputPerMillionTokens;
  const inputMicros = fresh * rates.inputPerMillionTokens + cached * cachedRate;
  const outputMicros = usage.outputTokens * rates.outputPerMillionTokens;
  return Math.round(inputMicros + outputMicros);
}

const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: "$", CNY: "¥" };

/** Renders micro-units as a short human string, e.g. 12_3400 -> "¥0.1234". */
export function formatCost(costMicros: number, currency: Currency): string {
  const units = costMicros / 1_000_000;
  const digits = units >= 1 ? 2 : 4;
  return `${CURRENCY_SYMBOLS[currency]}${units.toFixed(digits)}`;
}
