/**
 * Purpose: the AI-service section of the general settings page — the credentials every AI
 * feature runs on, plus the billing currency for models the provider sells in more than one
 * (extracted from SettingsPanel when the currency picker arrived).
 * Main exports: ApiSettingsSection.
 */
import { type Currency, modelCurrencies, resolveModelRates } from "@breadcrumb/core-llm";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type PriceOverride, useSettingsStore } from "../../stores/settingsStore";

/** The API form's unsaved edits, module-level so switching views (which unmounts this
 * panel) does not silently discard them — they come back on the next visit until saved
 * (Leo-approved 2026-08-16: keep the 保存 button, never lose typed text). */
let apiFormDraft: {
  baseUrl: string;
  apiKey: string;
  model: string;
  currency?: Currency;
  prices?: PriceFields;
} | null = null;

/** The three prices, as typed — kept as text so a half-entered number is not swallowed and
 * an empty box stays empty rather than becoming zero. */
interface PriceFields {
  input: string;
  output: string;
  cached: string;
}

const EMPTY_PRICES: PriceFields = { input: "", output: "", cached: "" };

function priceFieldsOf(config: { priceOverride?: PriceOverride } | null): PriceFields {
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
function readPrice(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";

export function ApiSettingsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);

  const savedBaseUrl = apiConfig?.baseUrl ?? "https://api.deepseek.com/v1";
  const savedApiKey = apiConfig?.apiKey ?? "";
  const savedModel = apiConfig?.model ?? "deepseek-v4-flash";
  const [baseUrl, setBaseUrl] = useState(apiFormDraft?.baseUrl ?? savedBaseUrl);
  const [apiKey, setApiKey] = useState(apiFormDraft?.apiKey ?? savedApiKey);
  const [model, setModel] = useState(apiFormDraft?.model ?? savedModel);
  const [pickedCurrency, setPickedCurrency] = useState(
    apiFormDraft?.currency ?? apiConfig?.priceCurrency,
  );
  const [prices, setPrices] = useState<PriceFields>(
    apiFormDraft?.prices ?? priceFieldsOf(apiConfig),
  );
  const [savedHint, setSavedHint] = useState(false);

  // The currencies the provider actually sells this model in. One or none means there is
  // nothing to ask about — the price table's own currency is the answer.
  const currencies = modelCurrencies(model.trim());
  // Same fallback resolveModelPrice uses, so the picker can never show a currency the
  // ledger is not actually billing in.
  const currency = pickedCurrency ?? currencies[0];
  const savedCurrency = apiConfig?.priceCurrency ?? currencies[0];

  const savedPrices = priceFieldsOf(apiConfig);
  const dirty =
    baseUrl !== savedBaseUrl ||
    apiKey !== savedApiKey ||
    model !== savedModel ||
    currency !== savedCurrency ||
    prices.input !== savedPrices.input ||
    prices.output !== savedPrices.output ||
    prices.cached !== savedPrices.cached;

  // What the built-in list says about this model, so the boxes can show those numbers as
  // placeholders instead of asking the learner to look them up.
  const catalogueRates = resolveModelRates(model.trim(), { currency });

  function edit(patch: Partial<{ baseUrl: string; apiKey: string; model: string }>): void {
    const next = { baseUrl, apiKey, model, ...patch };
    setBaseUrl(next.baseUrl);
    setApiKey(next.apiKey);
    setModel(next.model);
    apiFormDraft = { ...next, currency: pickedCurrency, prices };
  }

  function pickCurrency(value: Currency): void {
    setPickedCurrency(value);
    apiFormDraft = { baseUrl, apiKey, model, currency: value, prices };
  }

  function editPrice(patch: Partial<PriceFields>): void {
    const next = { ...prices, ...patch };
    setPrices(next);
    apiFormDraft = { baseUrl, apiKey, model, currency: pickedCurrency, prices: next };
  }

  async function save() {
    // Input and output are the pair that makes a rate card; one on its own would price half
    // of every call at zero, so an incomplete pair is treated as "no override at all".
    const input = readPrice(prices.input);
    const output = readPrice(prices.output);
    const cached = readPrice(prices.cached);
    const priceOverride =
      input !== undefined && output !== undefined
        ? {
            inputPerMillionTokens: input,
            outputPerMillionTokens: output,
            ...(cached !== undefined ? { cachedInputPerMillionTokens: cached } : {}),
          }
        : undefined;
    await saveApiConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      // Only a model sold in several currencies has an answer worth storing.
      ...(currencies.length > 1 && currency !== undefined ? { priceCurrency: currency } : {}),
      ...(priceOverride !== undefined ? { priceOverride } : {}),
    });
    apiFormDraft = null;
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("api.title")}</h3>
      <p className="text-sm text-stone-500">{t("api.hint")}</p>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.baseUrl")}
        <input
          value={baseUrl}
          onChange={(e) => edit({ baseUrl: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.apiKey")}
        <input
          type="password"
          value={apiKey}
          onChange={(e) => edit({ apiKey: e.target.value })}
          placeholder="sk-…"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.model")}
        <input
          value={model}
          onChange={(e) => edit({ model: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>

      {currencies.length > 1 && (
        <div className="space-y-1">
          <p className="text-sm text-stone-500">{t("api.priceCurrency")}</p>
          <div className="inline-flex rounded-full bg-stone-100 p-1">
            {currencies.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickCurrency(option)}
                aria-pressed={currency === option}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  currency === option ? "bg-amber-500 text-white" : "text-stone-500"
                }`}
              >
                {t(`api.currency${option}` as const)}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-400">{t("api.priceCurrencyHint")}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm text-stone-500">{t("api.priceOverride")}</p>
        <p className="text-xs text-stone-400">{t("api.priceOverrideHint")}</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 space-y-1 text-xs text-stone-400">
            {t("api.priceInput")}
            <input
              inputMode="decimal"
              value={prices.input}
              onChange={(e) => editPrice({ input: e.target.value })}
              placeholder={
                catalogueRates
                  ? String(catalogueRates.inputPerMillionTokens)
                  : t("api.priceUnknown")
              }
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex-1 space-y-1 text-xs text-stone-400">
            {t("api.priceOutput")}
            <input
              inputMode="decimal"
              value={prices.output}
              onChange={(e) => editPrice({ output: e.target.value })}
              placeholder={
                catalogueRates
                  ? String(catalogueRates.outputPerMillionTokens)
                  : t("api.priceUnknown")
              }
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex-1 space-y-1 text-xs text-stone-400">
            {t("api.priceCached")}
            <input
              inputMode="decimal"
              value={prices.cached}
              onChange={(e) => editPrice({ cached: e.target.value })}
              placeholder={
                catalogueRates?.cachedInputPerMillionTokens === undefined
                  ? t("api.priceNone")
                  : String(catalogueRates.cachedInputPerMillionTokens)
              }
              className={INPUT_CLASS}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        className="rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
      >
        {t("common:actions.save")}
      </button>
      {savedHint && <span className="ms-3 text-sm text-amber-600">{t("api.saved")}</span>}
      {!savedHint && dirty && (
        <span className="ms-3 text-sm text-stone-400">{t("api.unsaved")}</span>
      )}
    </section>
  );
}
