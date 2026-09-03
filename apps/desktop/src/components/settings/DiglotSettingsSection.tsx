/**
 * Purpose: settings section for language learning (spec 033 T10, trimmed 2026-08-16) — the
 * enable switch, the language pair the learner is on (with its download when they pick one
 * this machine does not have yet, 2026-09-01), and the metered smart-replacement toggle
 * (bound to the same llmRefineEnabled the billing page toggles). The algorithm's knobs (density, new-word cap,
 * guess frequency, placement) and the TTS setup are deliberately not user-tunable: the
 * algorithm self-adjusts, and audio either works out of the box or stays hidden.
 * Main exports: DiglotSettingsSection.
 */

import { languageNameOf } from "@breadcrumb/core-i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BUNDLED_PAIR_ID, PACK_CATALOG } from "../../lib/diglot/languagePacks";
import { useDiglotStore } from "../../stores/diglotStore";
import { VocabPlacementTest } from "../diglot/VocabPlacementTest";
import { DiglotInstalledPacks } from "./DiglotInstalledPacks";

/** Every pair on offer: the bundled one first, then whatever the catalogue was built with. */
function pairOptions(): { id: string; sourceLang: string; targetLang: string; bytes: number }[] {
  return [
    { id: BUNDLED_PAIR_ID, sourceLang: "zh", targetLang: "en", bytes: 0 },
    ...PACK_CATALOG.map((pack) => ({
      id: pack.id,
      sourceLang: pack.sourceLang,
      targetLang: pack.targetLang,
      bytes: pack.bytes,
    })),
  ];
}

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
  const choosePair = useDiglotStore((state) => state.choosePair);
  const installedPairs = useDiglotStore((state) => state.installedPairs);
  const installingPairId = useDiglotStore((state) => state.installingPairId);
  const installFailedPairId = useDiglotStore((state) => state.installFailedPairId);
  const options = pairOptions();
  const current = options.find((option) => option.id === settings.pairId);
  const [placementOpen, setPlacementOpen] = useState(false);
  const loaded = useDiglotStore((state) => state.loaded);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
          <p className="text-xs text-stone-400">
            {t("learning:diglot.pairStatus", {
              source: languageNameOf(current?.sourceLang ?? "zh"),
              target: languageNameOf(current?.targetLang ?? "en"),
            })}
          </p>
          <label className="flex flex-wrap items-center justify-between gap-4">
            <span>{t("learning:diglot.pairPicker")}</span>
            <select
              value={settings.pairId}
              disabled={installingPairId !== null}
              onChange={(event) => void choosePair(event.target.value)}
              className="min-w-0 max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-amber-400 coarse:text-base stacked:w-full"
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {installedPairs.includes(option.id)
                    ? t("learning:diglot.pairOption", {
                        source: languageNameOf(option.sourceLang),
                        target: languageNameOf(option.targetLang),
                      })
                    : t("learning:diglot.pairOptionToDownload", {
                        source: languageNameOf(option.sourceLang),
                        target: languageNameOf(option.targetLang),
                        size: Math.max(1, Math.round(option.bytes / 1_048_576)),
                      })}
                </option>
              ))}
            </select>
          </label>
          {installingPairId !== null && (
            <p className="text-xs text-stone-400">{t("learning:diglot.pairDownloading")}</p>
          )}
          {installFailedPairId !== null && installingPairId === null && (
            <p className="text-xs text-stone-500">{t("learning:diglot.pairDownloadFailed")}</p>
          )}
          <DiglotInstalledPacks />
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
          {placementOpen ? (
            <VocabPlacementTest onClose={() => setPlacementOpen(false)} />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <span>{t("learning:diglot.placementTitle")}</span>
                <p className="text-xs text-stone-400">{t("learning:diglot.placementHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setPlacementOpen(true)}
                className="shrink-0 rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:border-amber-400"
              >
                {settings.placementTestTaken
                  ? t("learning:diglot.placementRetake")
                  : t("learning:diglot.placementStart")}
              </button>
            </div>
          )}
          {/* Each pack names its own upstreams; the Chinese pack's three were hardcoded here
              and stayed on screen for every other language (caught 2026-09-01). */}
          <p className="text-xs text-stone-300">
            {t("learning:diglot.dataSources", {
              sources: (loaded?.pack.attribution ?? []).join(" · "),
            })}
          </p>
        </div>
      )}
    </section>
  );
}
