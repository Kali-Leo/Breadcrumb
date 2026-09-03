/**
 * Purpose: the billing currency for models the provider sells in more than one. One
 * currency or none means there is nothing to ask about, and this renders nothing.
 * Main exports: ApiCurrencyPicker.
 */
import type { Currency } from "@breadcrumb/core-llm";
import { useTranslation } from "react-i18next";

export function ApiCurrencyPicker({
  currencies,
  currency,
  onPick,
}: {
  currencies: readonly Currency[];
  currency: Currency | undefined;
  onPick(value: Currency): void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  if (currencies.length <= 1) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm text-stone-500">{t("api.priceCurrency")}</p>
      <div className="inline-flex rounded-full bg-stone-100 p-1">
        {currencies.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            aria-pressed={currency === option}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors coarse:inline-flex coarse:min-h-11 coarse:items-center ${
              currency === option ? "bg-amber-500 text-white" : "text-stone-500"
            }`}
          >
            {t(`api.currency${option}` as const)}
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-400">{t("api.priceCurrencyHint")}</p>
    </div>
  );
}
