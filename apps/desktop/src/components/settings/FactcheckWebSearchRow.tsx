/**
 * Purpose: the switch for the fact check's open-web evidence layer (Zhipu search) and the
 * key it runs on — an indented sub-row of the fact-check row, like the automatic-run switch
 * beside it. Two things make this row different from every other switch on the page, and
 * its text says both plainly: it is the one evidence source billed per call (the price is
 * printed next to it), and turning it on means the claim extracted from the learner's
 * question is sent to a search engine — a new place their words go, so it is off until
 * they say otherwise. The key is saved on its own, when the box loses focus; the switch
 * without a key does nothing, which the hint also says.
 * Main exports: FactcheckWebSearchRow.
 */
import { ZHIPU_SEARCH_PRICE_CNY } from "@breadcrumb/feature-factcheck";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { INPUT_CLASS } from "./apiSettingsForm";
import { Toggle } from "./SettingsToggle";

export function FactcheckWebSearchRow() {
  const { t } = useTranslation("settings");
  const factcheckOn = useSettingsStore((state) => state.featureSwitches.factcheck);
  const webSearchOn = useSettingsStore((state) => state.featureSwitches.factcheckWebSearch);
  const savedKey = useSettingsStore((state) => state.webSearchApiKey);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const setWebSearchApiKey = useSettingsStore((state) => state.setWebSearchApiKey);
  const [draftKey, setDraftKey] = useState(savedKey);

  // With the feature itself off there is nothing for this to govern.
  if (!factcheckOn) return null;

  const name = t("billing.features.factcheckWebSearch.name");
  const price = t("billing.features.factcheckWebSearch.price", { price: ZHIPU_SEARCH_PRICE_CNY });
  return (
    <div className="ms-4 space-y-2 border-stone-100 border-s ps-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-700">
            {name} <span className="text-xs text-stone-400">{price}</span>
          </p>
          <p className="text-xs text-stone-500">{t("billing.features.factcheckWebSearch.hint")}</p>
          <p className="text-xs text-amber-700">
            {t("billing.features.factcheckWebSearch.disclosure")}
          </p>
        </div>
        <Toggle
          on={webSearchOn}
          onClick={() => void setFeatureSwitch("factcheckWebSearch", !webSearchOn)}
          label={name}
        />
      </div>
      <label className="block space-y-1 text-xs text-stone-500">
        {t("billing.features.factcheckWebSearch.keyLabel")}
        <input
          type="password"
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          onBlur={() => {
            if (draftKey.trim() !== savedKey) void setWebSearchApiKey(draftKey);
          }}
          placeholder={t("billing.features.factcheckWebSearch.keyPlaceholder")}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </label>
      {webSearchOn && savedKey.length === 0 && (
        <p className="text-xs text-stone-400">{t("billing.features.factcheckWebSearch.noKey")}</p>
      )}
    </div>
  );
}
