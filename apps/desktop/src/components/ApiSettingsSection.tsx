/**
 * Purpose: the AI-service section of the general settings page — the credentials every AI
 * feature runs on, plus the billing currency for models the provider sells in more than one
 * (extracted from SettingsPanel when the currency picker arrived).
 * Main exports: ApiSettingsSection.
 */
import { type Currency, modelCurrencies } from "@breadcrumb/core-llm";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";

/** The API form's unsaved edits, module-level so switching views (which unmounts this
 * panel) does not silently discard them — they come back on the next visit until saved
 * (Leo-approved 2026-08-16: keep the 保存 button, never lose typed text). */
let apiFormDraft: { baseUrl: string; apiKey: string; model: string; currency?: Currency } | null =
  null;

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
  const [savedHint, setSavedHint] = useState(false);

  // The currencies the provider actually sells this model in. One or none means there is
  // nothing to ask about — the price table's own currency is the answer.
  const currencies = modelCurrencies(model.trim());
  // Same fallback resolveModelPrice uses, so the picker can never show a currency the
  // ledger is not actually billing in.
  const currency = pickedCurrency ?? currencies[0];
  const savedCurrency = apiConfig?.priceCurrency ?? currencies[0];

  const dirty =
    baseUrl !== savedBaseUrl ||
    apiKey !== savedApiKey ||
    model !== savedModel ||
    currency !== savedCurrency;

  function edit(patch: Partial<{ baseUrl: string; apiKey: string; model: string }>): void {
    const next = { baseUrl, apiKey, model, ...patch };
    setBaseUrl(next.baseUrl);
    setApiKey(next.apiKey);
    setModel(next.model);
    apiFormDraft = { ...next, currency: pickedCurrency };
  }

  function pickCurrency(value: Currency): void {
    setPickedCurrency(value);
    apiFormDraft = { baseUrl, apiKey, model, currency: value };
  }

  async function save() {
    await saveApiConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      // Only a model sold in several currencies has an answer worth storing.
      ...(currencies.length > 1 && currency !== undefined ? { priceCurrency: currency } : {}),
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
