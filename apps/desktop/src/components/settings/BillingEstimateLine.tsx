/**
 * Purpose: the "about ¥0.0023 per exchange" line under each feature on the spending page —
 * what one use of this feature costs, worked out from this account's own recorded calls when
 * there are enough of them and from the measured purpose catalogue otherwise, at the
 * configured model's rates. Says plainly when it cannot know rather than showing a number
 * nobody stands behind.
 * Main exports: BillingEstimateLine.
 */
import { useTranslation } from "react-i18next";
import { estimateFeatureCost, type PurposeAverages } from "../../lib/billing/billingEstimates";
import { currentPriceOverride } from "../../lib/platform/llmConfig";
import { useSettingsStore } from "../../stores/settingsStore";

const CADENCE_KEYS = {
  "per-round": "billing.cadencePerRound",
  "per-message": "billing.cadencePerMessage",
  "per-answer": "billing.cadencePerAnswer",
  "on-demand": "billing.cadenceOnDemand",
  "per-item-once": "billing.cadencePerItemOnce",
  "per-day": "billing.cadencePerDay",
} as const;

export function BillingEstimateLine({
  purposes,
  averages,
}: {
  purposes: readonly string[];
  /** This account's own averages for the model in use, loaded once by the panel. */
  averages: PurposeAverages;
}) {
  const { t } = useTranslation("settings");
  const apiConfig = useSettingsStore((state) => state.apiConfig);

  const estimate = estimateFeatureCost(
    purposes,
    {
      model: apiConfig?.model ?? "",
      currency: apiConfig?.priceCurrency,
      override: currentPriceOverride(),
    },
    averages,
  );

  if (estimate.kind === "free") {
    return <p className="text-xs text-stone-400">{t("billing.estimateFree")}</p>;
  }
  if (estimate.kind === "unknown-model") {
    return <p className="text-xs text-stone-400">{t("billing.estimateUnknownModel")}</p>;
  }
  if (estimate.kind === "unmeasured") {
    return <p className="text-xs text-stone-400">{t("billing.estimateUnmeasured")}</p>;
  }
  return (
    <p className="text-xs text-stone-400">
      {t("billing.estimate", {
        cost: estimate.cost,
        cadence: t(CADENCE_KEYS[estimate.cadence]),
      })}
    </p>
  );
}
