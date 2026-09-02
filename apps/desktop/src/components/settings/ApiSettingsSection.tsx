/**
 * Purpose: the AI-service section of the general settings page — the credentials every AI
 * feature runs on, plus the billing currency for models the provider sells in more than one
 * (extracted from SettingsPanel when the currency picker arrived). The unsaved draft and the
 * price parsing live in apiSettingsForm; the three field groups are their own components.
 * Main exports: ApiSettingsSection.
 */
import { type Currency, modelCurrencies, resolveModelRates } from "@breadcrumb/core-llm";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { ApiCredentialFields } from "./ApiCredentialFields";
import { ApiCurrencyPicker } from "./ApiCurrencyPicker";
import { ApiPriceFields } from "./ApiPriceFields";
import {
  clearApiFormDraft,
  type PriceFields,
  priceFieldsOf,
  readApiFormDraft,
  readPrice,
  writeApiFormDraft,
} from "./apiSettingsForm";

export function ApiSettingsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);
  const apiFormDraft = readApiFormDraft();

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
    writeApiFormDraft({ ...next, currency: pickedCurrency, prices });
  }

  function pickCurrency(value: Currency): void {
    setPickedCurrency(value);
    writeApiFormDraft({ baseUrl, apiKey, model, currency: value, prices });
  }

  function editPrice(patch: Partial<PriceFields>): void {
    const next = { ...prices, ...patch };
    setPrices(next);
    writeApiFormDraft({ baseUrl, apiKey, model, currency: pickedCurrency, prices: next });
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
    clearApiFormDraft();
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("api.title")}</h3>
      <p className="text-sm text-stone-500">{t("api.hint")}</p>
      <ApiCredentialFields baseUrl={baseUrl} apiKey={apiKey} model={model} onEdit={edit} />
      <ApiCurrencyPicker currencies={currencies} currency={currency} onPick={pickCurrency} />
      <ApiPriceFields prices={prices} catalogueRates={catalogueRates} onEdit={editPrice} />
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
