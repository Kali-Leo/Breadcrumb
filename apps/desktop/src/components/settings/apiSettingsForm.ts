/**
 * Purpose: the API form's shape outside React — the unsaved draft (module-level so
 * switching views, which unmounts the panel, does not silently discard typed text: it comes
 * back on the next visit until saved — Leo-approved 2026-08-16), the three prices as typed,
 * and the one shared input class.
 * Main exports: PriceFields, EMPTY_PRICES, priceFieldsOf, readPrice, INPUT_CLASS,
 * ApiFormDraft, readApiFormDraft, writeApiFormDraft, clearApiFormDraft.
 */
import type { Currency } from "@breadcrumb/core-llm";
import type { PriceOverride } from "../../stores/settingsStore";

/** The three prices, as typed — kept as text so a half-entered number is not swallowed and
 * an empty box stays empty rather than becoming zero. */
export interface PriceFields {
  input: string;
  output: string;
  cached: string;
}

export interface ApiFormDraft {
  baseUrl: string;
  apiKey: string;
  model: string;
  currency?: Currency;
  prices?: PriceFields;
}

export const EMPTY_PRICES: PriceFields = { input: "", output: "", cached: "" };

export const INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400 coarse:min-h-11 coarse:text-base";

let apiFormDraft: ApiFormDraft | null = null;

export function readApiFormDraft(): ApiFormDraft | null {
  return apiFormDraft;
}

export function writeApiFormDraft(draft: ApiFormDraft): void {
  apiFormDraft = draft;
}

export function clearApiFormDraft(): void {
  apiFormDraft = null;
}

export function priceFieldsOf(config: { priceOverride?: PriceOverride } | null): PriceFields {
  const override = config?.priceOverride;
  if (override === undefined) return EMPTY_PRICES;
  return {
    input: String(override.inputPerMillionTokens),
    output: String(override.outputPerMillionTokens),
    cached:
      override.cachedInputPerMillionTokens === undefined
        ? ""
        : String(override.cachedInputPerMillionTokens),
  };
}

/** A number the learner typed, or undefined when the box is empty or holds nonsense — a
 * price we cannot read is a price we do not use. */
export function readPrice(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
