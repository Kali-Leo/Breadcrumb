/**
 * Purpose: the switch that decides whether a 学习模式 answer is checked on its own or only when
 * the reader presses 求证 — an indented sub-row of the fact-check row, because it is not a
 * separate feature and has no separate bill; it changes how often the same feature runs.
 * It says the cost in words rather than only in a number: automatic means one check per round,
 * which is nothing on a free key and real money on a metered one.
 * Main exports: FactcheckAutoRow.
 */
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { Toggle } from "./SettingsToggle";

export function FactcheckAutoRow() {
  const { t } = useTranslation("settings");
  const factcheckOn = useSettingsStore((state) => state.featureSwitches.factcheck);
  const autoOn = useSettingsStore((state) => state.featureSwitches.factcheckAuto);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);

  // With the feature itself off there is nothing for this to govern, and a switch that changes
  // nothing is worse than no switch.
  if (!factcheckOn) return null;

  const name = t("billing.features.factcheckAuto.name");
  return (
    <div className="ms-4 flex items-center justify-between gap-4 border-stone-100 border-s ps-3">
      <div>
        <p className="text-sm text-stone-700">{name}</p>
        <p className="text-xs text-stone-500">{t("billing.features.factcheckAuto.hint")}</p>
      </div>
      <Toggle
        on={autoOn}
        onClick={() => void setFeatureSwitch("factcheckAuto", !autoOn)}
        label={name}
      />
    </div>
  );
}
