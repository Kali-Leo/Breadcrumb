/**
 * Purpose: the measured facts about how each provider behaves and what it charges — separate
 * from the roster logic in providers.ts, which is about reading a catalogue and finding keys.
 * Everything here was established by watching a real call fail (or by reading a price row),
 * so each constant carries the observation that put it there.
 * Main exports: requiresLeadingSystem, concurrencyCapFor, benchRatesFor.
 */
import type { ModelRates } from "@breadcrumb/core-llm";
import type { BenchModel } from "./providers";

/**
 * Providers whose API refuses a system message anywhere but the front. Measured, not read off
 * a document: SiliconFlow answers `HTTP 400 {"code":20015,"message":"System message must be
 * at the beginning."}` to the exact request core-llm builds, because the answer-language
 * directive is appended last. See bench/messagePrep.ts for what the bench does about it and
 * why that is a finding about Breadcrumb rather than about the model.
 */
const LEADING_SYSTEM_ONLY: ReadonlySet<string> = new Set(["siliconflow"]);

export function requiresLeadingSystem(providerId: string): boolean {
  return LEADING_SYSTEM_ONLY.has(providerId);
}

/**
 * Per-provider ceiling on calls in flight, where the provider's own limit is lower than
 * anything a run would sensibly ask for. Zhipu's free tier publishes no concurrency number
 * and answers 429 to a second call in flight, so one at a time is the only rate that measures
 * the model rather than the rate limiter. Gemini's free tier answers 429 to a sustained six
 * in flight as well — 188 of 200 calls in the 2026-09-09 verdict run died that way, which
 * reads in the report as the model failing rather than as us being throttled.
 */
const CONCURRENCY_CAP: Readonly<Record<string, number>> = { zhipu: 1, gemini: 1 };

export function concurrencyCapFor(providerId: string, requested: number): number {
  return Math.max(1, Math.min(requested, CONCURRENCY_CAP[providerId] ?? requested));
}

/**
 * What one model's tokens cost, in CNY per million. The catalogue's own price row is used
 * for every provider EXCEPT the ones core-llm already prices: DeepSeek's entry there carries
 * the peak/off-peak schedule and a verification date, which a flat number cannot express.
 */
export function benchRatesFor(model: BenchModel): ModelRates {
  const price = model.provider.price;
  return {
    currency: "CNY",
    inputPerMillionTokens: price.in,
    cachedInputPerMillionTokens: price.cache_hit ?? undefined,
    outputPerMillionTokens: price.out,
  };
}
