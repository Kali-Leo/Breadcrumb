/**
 * Purpose: settings section for the diglot weave (spec 033 T10, trimmed 2026-08-16) — the
 * enable switch, the pair line, and the metered smart-replacement toggle (bound to the same
 * llmRefineEnabled the billing page toggles). The algorithm's knobs (density, new-word cap,
 * guess frequency, placement) and the TTS setup are deliberately not user-tunable: the
 * algorithm self-adjusts, and audio either works out of the box or stays hidden.
 * Main exports: DiglotSettingsSection.
 */

import { useTranslation } from "react-i18next";
import { useDiglotStore } from "../stores/diglotStore";

function ToggleSwitch({
  on,
  ariaLabel,
  onClick,
}: {
  on: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-amber-500" : "bg-stone-300"}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}

export function DiglotSettingsSection() {
  const { t } = useTranslation(["learning", "common"]);
  const settings = useDiglotStore((state) => state.settings);
  const saveSettings = useDiglotStore((state) => state.saveSettings);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-stone-700">{t("learning:diglot.settingsTitle")}</h3>
          <p className="text-xs text-stone-400">{t("learning:diglot.settingsHint")}</p>
        </div>
        <ToggleSwitch
          on={settings.enabled}
          ariaLabel={t("learning:diglot.enableAria")}
          onClick={() => void saveSettings({ enabled: !settings.enabled })}
        />
      </div>
      {settings.enabled && (
        <div className="space-y-3 text-sm text-stone-600">
          <p className="text-xs text-stone-400">{t("learning:diglot.pairStatus")}</p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <span>{t("learning:diglot.llmRefineLabel")}</span>
              <p className="text-xs text-stone-400">{t("learning:diglot.llmRefineHint")}</p>
            </div>
            <ToggleSwitch
              on={settings.llmRefineEnabled}
              ariaLabel={t("learning:diglot.llmRefineAria")}
              onClick={() => void saveSettings({ llmRefineEnabled: !settings.llmRefineEnabled })}
            />
          </div>
          <p className="text-xs text-stone-300">{t("learning:diglot.dataSources")}</p>
        </div>
      )}
    </section>
  );
}
