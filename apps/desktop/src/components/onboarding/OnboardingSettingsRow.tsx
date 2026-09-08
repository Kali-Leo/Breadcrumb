/**
 * Purpose: the settings row that lets someone see the introduction again, bring back every
 * page's own note, take the guided tour, and take the example data away.
 *
 * They matter for the same reason: an introduction that can only happen once is a trap for
 * anyone who skipped it in a hurry, and example data you cannot remove is not an example, it
 * is contamination. Restoring the page notes needs no reload — nothing is showing them yet,
 * and they appear on the next visit to each page. Removing the example data does reload,
 * because half the app is already holding those rows in memory.
 * Main exports: OnboardingSettingsRow.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasDemoData, removeDemoData } from "../../lib/platform/demoData";
import { useSettingsStore } from "../../stores/settingsStore";

export function OnboardingSettingsRow() {
  const { t } = useTranslation("onboarding");
  const [demoInstalled, setDemoInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guidesRestored, setGuidesRestored] = useState(false);

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
          className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 coarse:min-h-11"
        >
          {t("settings.replay")}
        </button>
        <button
          type="button"
          onClick={() => {
            void useSettingsStore
              .getState()
              .resetPageGuides()
              .then(() => setGuidesRestored(true));
          }}
          className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 coarse:min-h-11"
        >
          {t("settings.resetGuides")}
        </button>
        {demoInstalled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void removeDemoData().then(() => window.location.reload());
            }}
            className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-60 coarse:min-h-11"
          >
            {t("settings.removeDemo")}
          </button>
        ) : (
          <span className="text-stone-400 text-xs">{t("settings.demoAbsent")}</span>
        )}
      </div>
      {guidesRestored && <p className="text-stone-500 text-sm">{t("settings.guidesRestored")}</p>}
    </section>
  );
}
