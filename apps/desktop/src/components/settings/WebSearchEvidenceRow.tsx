/**
 * Purpose: the switch for the open-web evidence layer (Zhipu search) that 学习模式 looks a
 * topic up through, and the key it runs on. Two things make this row different from every
 * other switch on the page, and its text says both plainly: it is the one evidence source
 * billed per call (the price is printed next to it), and turning it on means search words
 * taken from the learner's question are sent to a search engine — a new place their words
 * go, so it is off until they say otherwise. The key is saved on its own, when the box loses
 * focus; the switch without a key does nothing, which the hint also says.
 * Main exports: WebSearchEvidenceRow.
 */
import { ZHIPU_SEARCH_PRICE_CNY } from "@breadcrumb/feature-factcheck";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { INPUT_CLASS } from "./apiSettingsForm";
import { Toggle } from "./SettingsToggle";

export function WebSearchEvidenceRow() {
  const { t } = useTranslation("settings");
  const webSearchOn = useSettingsStore((state) => state.featureSwitches.webSearchEvidence);
  const savedKey = useSettingsStore((state) => state.webSearchApiKey);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const setWebSearchApiKey = useSettingsStore((state) => state.setWebSearchApiKey);
  const [draftKey, setDraftKey] = useState(savedKey);

  const name = t("billing.features.webSearchEvidence.name");
  const price = t("billing.features.webSearchEvidence.price", { price: ZHIPU_SEARCH_PRICE_CNY });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-700">
            {name} <span className="text-xs text-stone-400">{price}</span>
          </p>
          <p className="text-xs text-stone-500">{t("billing.features.webSearchEvidence.hint")}</p>
          <p className="text-xs text-amber-700">
            {t("billing.features.webSearchEvidence.disclosure")}
          </p>
        </div>
        <Toggle
          on={webSearchOn}
          onClick={() => void setFeatureSwitch("webSearchEvidence", !webSearchOn)}
          label={name}
        />
      </div>
      <label className="block space-y-1 text-xs text-stone-500">
        {t("billing.features.webSearchEvidence.keyLabel")}
        <input
          type="password"
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          onBlur={() => {
            if (draftKey.trim() !== savedKey) void setWebSearchApiKey(draftKey);
          }}
          placeholder={t("billing.features.webSearchEvidence.keyPlaceholder")}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </label>
      {webSearchOn && savedKey.length === 0 && (
        <p className="text-xs text-stone-400">{t("billing.features.webSearchEvidence.noKey")}</p>
      )}
    </div>
  );
}
