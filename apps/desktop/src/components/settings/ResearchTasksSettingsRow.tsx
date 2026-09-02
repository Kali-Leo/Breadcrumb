/**
 * Purpose: the 🔬 research task platform's settings-page switch row (spec 036 §4). Turning
 * it on needs no confirmation; turning it off shows RESEARCH_COPY's one-time plain
 * explanation first (Leo's 2026-08-13 ruling: no guilt-trip retention, state the four facts
 * once, then never ask again). Zero token cost, so it carries no spend line.
 * Main exports: ResearchTasksSettingsRow.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { Toggle } from "./SettingsToggle";

export function ResearchTasksSettingsRow() {
  const { t } = useTranslation(["settings", "common"]);
  const researchTasksEnabled = useSettingsStore((state) => state.featureSwitches.researchTasks);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const [confirmingClose, setConfirmingClose] = useState(false);

  return (
    <div className="border-t border-stone-100 pt-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-700">{t("research.settingsRowTitle")}</p>
          <p className="text-xs text-stone-500">{t("research.settingsRowHint")}</p>
        </div>
        <Toggle
          on={researchTasksEnabled}
          onClick={() => {
            if (researchTasksEnabled) {
              setConfirmingClose(true);
            } else {
              void setFeatureSwitch("researchTasks", true);
            }
          }}
          label={t("research.settingsRowTitle")}
        />
      </div>
      {confirmingClose && (
        <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
          <p className="font-semibold text-stone-700">{t("research.closeConfirmTitle")}</p>
          <p>{t("research.closeConfirmWhatItDoes")}</p>
          <p>{t("research.closeConfirmDataStaysLocal")}</p>
          <p>{t("research.closeConfirmResearchValue")}</p>
          <p>{t("research.closeConfirmWhatChanges")}</p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                void setFeatureSwitch("researchTasks", false);
                setConfirmingClose(false);
              }}
              className="rounded bg-red-500 px-2 py-1 text-white"
            >
              {t("research.closeConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClose(false)}
              className="rounded border border-stone-200 px-2 py-1 text-stone-500"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
