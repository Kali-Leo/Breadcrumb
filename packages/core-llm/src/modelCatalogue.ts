/**
 * Purpose: the single source of truth for what every supported model costs and what
 * discount mechanisms it offers. Adding or repricing a model is one entry here and nothing
 * else — the cost maths, the settings picker and the billing page's per-feature estimates
 * all read from this table.
 *
 * EVERY entry must carry `source` (the provider's own pricing page, never an aggregator or
 * a blog — those were checked against the official pages on 2026-08-31 and most were wrong)
 * and `verifiedAt`. An entry nobody has re-verified is a liability, not data.
 *
 * Main exports: Currency, ModelRates, OffPeakSchedule, ModelEntry, MODEL_CATALOGUE.
 */

export type Currency = "USD" | "CNY";

/** What a model costs per 1,000,000 tokens, in one currency. */
export interface ModelRates {
  currency: Currency;
  /** Input tokens the provider had to read fresh. */
  inputPerMillionTokens: number;
  /** Input tokens served from the provider's prefix cache. Undefined = no prefix cache, so
   * every input token is billed at the fresh rate. */
  cachedInputPerMillionTokens?: number;
  outputPerMillionTokens: number;
}

/** Providers that charge by time of day. Everything outside a peak window is off-peak. */
export interface OffPeakSchedule {
  /** Multiplier applied to every rate outside the peak windows (0.5 = half price). */
  multiplier: number;
  /** ISO weekday numbers (1 = Monday … 7 = Sunday) the peak windows apply on. */
  peakWeekdays: readonly number[];
  /** Peak windows as [startHourUtc, endHourUtc), half-open. */
  peakWindowsUtc: readonly (readonly [number, number])[];
}

export interface ModelEntry {
  /** One rate card per currency the provider sells this model in — never empty. The first
   * entry is what an account that has not said which platform it is on gets billed at. */
  rates: readonly [ModelRates, ...ModelRates[]];
  /** Present when the provider prices by time of day. */
  offPeak?: OffPeakSchedule;
  /** Flat multiplier for work submitted to a deferred/batch endpoint (0.5 = half price).
   * Absent means the provider has no batch discount. */
  batchMultiplier?: number;
  /** The provider's own pricing page these numbers were read off. */
  source: string;
  /** When a human last opened `source` and compared it line by line. */
  verifiedAt: string;
}

/** DeepSeek prices by time of day: peak is 01:00–04:00 and 06:00–10:00 UTC, Monday to
 * Friday, and off-peak is half. That leaves roughly 79% of the week at the lower rate. */
const DEEPSEEK_OFF_PEAK: OffPeakSchedule = {
  multiplier: 0.5,
  peakWeekdays: [1, 2, 3, 4, 5],
  peakWindowsUtc: [
    [1, 4],
    [6, 10],
  ],
};

/** Both language editions are cited: the CNY and USD tables live on different pages, and
 * the cache-hit rows differ by more than the exchange ratio, so neither can be derived from
 * the other — read both. */
const DEEPSEEK_SOURCE =
  "https://api-docs.deepseek.com/quick_start/pricing + /zh-cn/quick_start/pricing";
const DEEPSEEK_VERIFIED_AT = "2026-08-31";

/**
 * Rates below are the PEAK ones; `effectiveRates` applies the off-peak multiplier from the
 * call's own timestamp rather than assuming one or the other. DeepSeek sells these models
 * in CNY on its China platform and USD internationally, hence two rate cards each.
 */
export const MODEL_CATALOGUE: Readonly<Record<string, ModelEntry>> = {
  "deepseek-v4-flash": {
    rates: [
      {
        currency: "CNY",
        inputPerMillionTokens: 3,
        cachedInputPerMillionTokens: 0.1,
        outputPerMillionTokens: 9,
      },
      {
        currency: "USD",
        inputPerMillionTokens: 0.44,
        cachedInputPerMillionTokens: 0.014,
        outputPerMillionTokens: 1.32,
      },
    ],
    offPeak: DEEPSEEK_OFF_PEAK,
    source: DEEPSEEK_SOURCE,
    verifiedAt: DEEPSEEK_VERIFIED_AT,
  },
  "deepseek-v4-pro": {
    rates: [
      {
        currency: "CNY",
        inputPerMillionTokens: 9,
        cachedInputPerMillionTokens: 0.3,
        outputPerMillionTokens: 27,
      },
      {
        currency: "USD",
        inputPerMillionTokens: 1.32,
        cachedInputPerMillionTokens: 0.044,
        outputPerMillionTokens: 3.96,
      },
    ],
    offPeak: DEEPSEEK_OFF_PEAK,
    source: DEEPSEEK_SOURCE,
    verifiedAt: DEEPSEEK_VERIFIED_AT,
  },
};

/** True when `at` falls inside one of the entry's peak windows. A model with no schedule is
 * never in a peak window, so its rates are used as written. */
export function isPeakHour(entry: ModelEntry, at: Date): boolean {
  const schedule = entry.offPeak;
  if (schedule === undefined) return false;
  // getUTCDay() is 0 for Sunday; the schedule speaks ISO weekdays where Sunday is 7.
  const isoWeekday = at.getUTCDay() === 0 ? 7 : at.getUTCDay();
  if (!schedule.peakWeekdays.includes(isoWeekday)) return false;
  const hour = at.getUTCHours();
  return schedule.peakWindowsUtc.some(([start, end]) => hour >= start && hour < end);
}

/** The rates actually in force for one call: the catalogue's peak numbers, discounted for
 * off-peak hours and again for deferred (batch) submission where the provider offers it. */
export function effectiveRates(
  entry: ModelEntry,
  base: ModelRates,
  options: { at: Date; deferred?: boolean },
): ModelRates {
  let multiplier = isPeakHour(entry, options.at) ? 1 : (entry.offPeak?.multiplier ?? 1);
  if (options.deferred === true && entry.batchMultiplier !== undefined) {
    multiplier *= entry.batchMultiplier;
  }
  if (multiplier === 1) return base;
  return {
    currency: base.currency,
    inputPerMillionTokens: base.inputPerMillionTokens * multiplier,
    cachedInputPerMillionTokens:
      base.cachedInputPerMillionTokens === undefined
        ? undefined
        : base.cachedInputPerMillionTokens * multiplier,
    outputPerMillionTokens: base.outputPerMillionTokens * multiplier,
  };
}

/** Whether deferring this model's background work would actually save anything — the
 * condition for offering the learner the "run background work later" switch at all. */
export function deferralSaves(entry: ModelEntry): boolean {
  return entry.batchMultiplier !== undefined || entry.offPeak !== undefined;
}
