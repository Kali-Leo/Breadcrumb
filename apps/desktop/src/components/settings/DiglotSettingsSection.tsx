/**
 * Purpose: settings section for language learning (spec 033 T10, trimmed 2026-08-16) — the
 * enable switch, which language the learner is learning (with its download when they pick one
 * this machine does not have yet, 2026-09-01), and the metered smart-replacement toggle
 * (bound to the same llmRefineEnabled the billing page toggles). What the words are replaced
 * FROM is not offered: it has to be the language the AI answers in (see
 * lib/diglot/diglotPairsForLanguage.ts), so the picker lists target languages only, and an
 * answer language with no word data at all says so instead of offering an empty list
 * (Leo 2026-09-04). The algorithm's knobs (density, new-word cap, guess frequency, placement)
 * and the TTS setup are deliberately not user-tunable: the algorithm self-adjusts, and audio
 * either works out of the box or stays hidden.
 * Main exports: DiglotSettingsSection.
 */

import { languageNameOf } from "@breadcrumb/core-i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type DiglotPairOption,
  diglotPickerView,
  SOURCE_LANGS_WITH_PACKS,
  sourceLangForAnswer,
} from "../../lib/diglot/diglotPairsForLanguage";
import { useDiglotStore } from "../../stores/diglotStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { VocabPlacementTest } from "../diglot/VocabPlacementTest";
import { DiglotInstalledPacks } from "./DiglotInstalledPacks";
import { Toggle } from "./SettingsToggle";

export function DiglotSettingsSection() {
  const { t } = useTranslation(["learning", "common"]);
  const settings = useDiglotStore((state) => state.settings);
  const saveSettings = useDiglotStore((state) => state.saveSettings);
  const choosePair = useDiglotStore((state) => state.choosePair);
  const installedPairs = useDiglotStore((state) => state.installedPairs);
  const installingPairId = useDiglotStore((state) => state.installingPairId);
  const installFailedPairId = useDiglotStore((state) => state.installFailedPairId);
  const pairResetTargetLang = useDiglotStore((state) => state.pairResetTargetLang);
  const loaded = useDiglotStore((state) => state.loaded);
  const interfaceLanguage = useSettingsStore((state) => state.language);
  const answerLanguage = useSettingsStore((state) => state.answerLanguage);
  const [placementOpen, setPlacementOpen] = useState(false);

  const sourceLang = sourceLangForAnswer(interfaceLanguage, answerLanguage);
  const { options, currentId, switchOn, mustChoose, noPackForLanguage } = diglotPickerView({
    sourceLang,
    pairId: settings.pairId,
    enabled: settings.enabled,
  });
  const current = options.find((option) => option.id === currentId);

  function optionLabel(option: DiglotPairOption): string {
    const target = languageNameOf(option.targetLang);
    if (installedPairs.includes(option.id)) return t("learning:diglot.pairOption", { target });
    return t("learning:diglot.pairOptionToDownload", {
      target,
      size: Math.max(1, Math.round(option.bytes / 1_048_576)),
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-stone-700">{t("learning:diglot.settingsTitle")}</h3>
          <p className="text-xs text-stone-400">{t("learning:diglot.settingsHint")}</p>
        </div>
        <Toggle
          on={switchOn}
          label={t("learning:diglot.enableAria")}
          onClick={() => void saveSettings({ enabled: !switchOn })}
        />
      </div>
      {noPackForLanguage && (
        <p className="text-sm text-stone-500">
          {t("learning:diglot.noPackForLanguage", {
            language: languageNameOf(sourceLang),
            languages: SOURCE_LANGS_WITH_PACKS.map(languageNameOf).join(" · "),
          })}
        </p>
      )}
      {(switchOn || mustChoose) && (
        <div className="space-y-3 text-sm text-stone-600">
          {switchOn && current !== undefined && (
            <p className="text-xs text-stone-400">
              {t("learning:diglot.pairStatus", {
                source: languageNameOf(sourceLang),
                target: languageNameOf(current.targetLang),
              })}
            </p>
          )}
          {pairResetTargetLang !== null && (
            <p className="text-xs text-stone-500">
              {t("learning:diglot.pairResetForLanguage", {
                language: languageNameOf(sourceLang),
                target: languageNameOf(pairResetTargetLang),
              })}
            </p>
          )}
          <label className="flex flex-wrap items-center justify-between gap-4">
            <span>{t("learning:diglot.pairPicker")}</span>
            <select
              value={currentId ?? ""}
              disabled={installingPairId !== null}
              onChange={(event) => void choosePair(event.target.value)}
              className="min-w-0 max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-amber-400 coarse:min-h-11 coarse:text-base stacked:w-full"
            >
              {currentId === null && (
                <option value="" disabled>
                  {t("learning:diglot.pairPickerUnset")}
                </option>
              )}
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option)}
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
          {switchOn && (
            <>
              <DiglotInstalledPacks />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span>{t("learning:diglot.llmRefineLabel")}</span>
                  <p className="text-xs text-stone-400">{t("learning:diglot.llmRefineHint")}</p>
                </div>
                <Toggle
                  on={settings.llmRefineEnabled}
                  label={t("learning:diglot.llmRefineAria")}
                  onClick={() =>
                    void saveSettings({ llmRefineEnabled: !settings.llmRefineEnabled })
                  }
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
                    className="shrink-0 rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:border-amber-400 coarse:min-h-11"
                  >
                    {settings.placementTestTaken
                      ? t("learning:diglot.placementRetake")
                      : t("learning:diglot.placementStart")}
                  </button>
                </div>
              )}
              {/* Each pack names its own upstreams; the Chinese pack's three were hardcoded
                  here and stayed on screen for every other language (caught 2026-09-01). */}
              <p className="text-xs text-stone-300">
                {t("learning:diglot.dataSources", {
                  sources: (loaded?.pack.attribution ?? []).join(" · "),
                })}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
