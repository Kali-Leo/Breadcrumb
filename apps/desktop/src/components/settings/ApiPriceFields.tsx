/**
 * Purpose: the per-million-token price override boxes. The built-in catalogue's numbers show
 * as placeholders, so nobody has to look a published price up to see what is being billed.
 * Main exports: ApiPriceFields.
 */
import type { ModelRates } from "@breadcrumb/core-llm";
import { useTranslation } from "react-i18next";
import { INPUT_CLASS, type PriceFields } from "./apiSettingsForm";

export function ApiPriceFields({
  prices,
  catalogueRates,
  onEdit,
}: {
  prices: PriceFields;
  catalogueRates: ModelRates | undefined;
  onEdit(patch: Partial<PriceFields>): void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <div className="space-y-1">
      <p className="text-sm text-stone-500">{t("api.priceOverride")}</p>
      <p className="text-xs text-stone-400">{t("api.priceOverrideHint")}</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 space-y-1 text-xs text-stone-400">
          {t("api.priceInput")}
          <input
            inputMode="decimal"
            value={prices.input}
            onChange={(e) => onEdit({ input: e.target.value })}
            placeholder={
              catalogueRates ? String(catalogueRates.inputPerMillionTokens) : t("api.priceUnknown")
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex-1 space-y-1 text-xs text-stone-400">
          {t("api.priceOutput")}
          <input
            inputMode="decimal"
            value={prices.output}
            onChange={(e) => onEdit({ output: e.target.value })}
            placeholder={
              catalogueRates ? String(catalogueRates.outputPerMillionTokens) : t("api.priceUnknown")
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex-1 space-y-1 text-xs text-stone-400">
          {t("api.priceCached")}
          <input
            inputMode="decimal"
            value={prices.cached}
            onChange={(e) => onEdit({ cached: e.target.value })}
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
  );
}
