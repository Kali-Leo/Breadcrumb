/**
 * Purpose: the settings row that lets someone see the opening slides again, bring back every
 * feature's first-use bubble, and take the example data away.
 *
 * They matter for the same reason: an introduction that can only happen once is a trap for
 * anyone who skipped it in a hurry, and example data you cannot remove is not an example, it
 * is contamination. Bringing the bubbles back needs no reload — nothing is showing them yet,
 * and each appears the next time its feature is on screen. Removing the example data does
 * reload, because half the app is already holding those rows in memory.
 * Main exports: OnboardingSettingsRow.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasDemoData, removeDemoData } from "../../lib/platform/demoData";
import { useSettingsStore } from "../../stores/settingsStore";

const BUTTON =
  "rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-60 coarse:min-h-11";

export function OnboardingSettingsRow() {
  const { t } = useTranslation("onboarding");
  const [demoInstalled, setDemoInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hintsRestored, setHintsRestored] = useState(false);

  useEffect(() => {
    void hasDemoData().then(setDemoInstalled);
  }, []);

  return (
    <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("settings.title")}</h3>
      <p className="text-sm text-stone-500">{t("settings.hint")}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            void useSettingsStore
              .getState()
              .resetOnboarding()
              .then(() => window.location.reload());
          }}
          className={BUTTON}
        >
          {t("settings.replay")}
        </button>
        <button
          type="button"
          onClick={() => {
            void useSettingsStore
              .getState()
              .resetHints()
              .then(() => setHintsRestored(true));
          }}
          className={BUTTON}
        >
          {t("settings.resetHints")}
        </button>
        {demoInstalled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void removeDemoData().then(() => window.location.reload());
            }}
            className={BUTTON}
          >
            {t("settings.removeDemo")}
          </button>
        ) : (
          <span className="text-stone-400 text-xs">{t("settings.demoAbsent")}</span>
        )}
      </div>
      {hintsRestored && <p className="text-stone-500 text-sm">{t("settings.hintsRestored")}</p>}
    </section>
  );
}
