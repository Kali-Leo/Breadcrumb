/**
 * Purpose: settings section for the diglot weave (spec 033 T10) — enable switch, pair
 * display, density slider, new-word pace, guess level (no "off": the gate is part of the
 * mechanism), TTS config. All local, zero token cost.
 * Main exports: DiglotSettingsSection.
 */
import { DIGLOT_UI_COPY, GUESS_LEVEL_BASE, type GuessLevel } from "@breadcrumb/plugin-diglot-weave";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useDiglotStore } from "../stores/diglotStore";

const GUESS_LEVEL_LABELS: Record<GuessLevel, string> = {
  low: DIGLOT_UI_COPY.guessLevelLow,
  standard: DIGLOT_UI_COPY.guessLevelStandard,
  high: DIGLOT_UI_COPY.guessLevelHigh,
};

export function DiglotSettingsSection() {
  const settings = useDiglotStore((state) => state.settings);
  const saveSettings = useDiglotStore((state) => state.saveSettings);
  const cardsByLemma = useDiglotStore((state) => state.cardsByLemma);
  const newToday = useDiglotStore((state) => state.newWordsIntroducedToday);

  // Text inputs commit on blur/Enter (macOS System Settings model), not per keystroke —
  // per-keystroke saves each wiped and re-wove every message (spec: saveSettings only
  // invalidates on WEAVE_AFFECTING_SETTING_KEYS now, but a 40-char path is still 40 writes
  // and, while llmRefineEnabled, billed LLM refine calls for keys that don't even affect
  // weaving). Checkboxes/sliders below keep instant apply — they're one discrete action.
  const [piperPathDraft, setPiperPathDraft] = useState(settings.piperPath);
  const [piperModelPathDraft, setPiperModelPathDraft] = useState(settings.piperModelPath);
  useEffect(() => setPiperPathDraft(settings.piperPath), [settings.piperPath]);
  useEffect(() => setPiperModelPathDraft(settings.piperModelPath), [settings.piperModelPath]);

  const commitPiperPath = (): void => {
    if (piperPathDraft !== settings.piperPath) void saveSettings({ piperPath: piperPathDraft });
  };
  const commitPiperModelPath = (): void => {
    if (piperModelPathDraft !== settings.piperModelPath) {
      void saveSettings({ piperModelPath: piperModelPathDraft });
    }
  };
  // Enter commits by blurring — the blur handler is the single commit path for both inputs.
  const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const inputClass =
    "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-stone-700">{DIGLOT_UI_COPY.settingsTitle}</h3>
          <p className="text-xs text-stone-400">{DIGLOT_UI_COPY.settingsHint}</p>
        </div>
        <button
          type="button"
          aria-label="语言学习开关"
          onClick={() => void saveSettings({ enabled: !settings.enabled })}
          className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${settings.enabled ? "bg-amber-500" : "bg-stone-300"}`}
        >
          <span
            className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.enabled ? "translate-x-6" : "translate-x-0"}`}
          />
        </button>
      </div>
      {settings.enabled && (
        <div className="space-y-3 text-sm text-stone-600">
          <p className="text-xs text-stone-400">
            从中文学 English · 正在学 {cardsByLemma.size} 个词 · 今天新遇到 {newToday} 个
          </p>
          <label className="block space-y-1">
            {DIGLOT_UI_COPY.densityLabel} {(settings.density * 100).toFixed(0)}%
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={Math.round(settings.density * 100)}
              onChange={(e) => void saveSettings({ density: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
          <label className="block space-y-1">
            {DIGLOT_UI_COPY.newWordCapLabel} {settings.newWordDailyBase}
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={settings.newWordDailyBase}
              onChange={(e) => void saveSettings({ newWordDailyBase: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <div className="space-y-1">
            <span>{DIGLOT_UI_COPY.guessLevelLabel}</span>
            <div className="flex gap-2">
              {(Object.keys(GUESS_LEVEL_BASE) as GuessLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => void saveSettings({ guessLevel: level })}
                  className={`rounded-lg px-3 py-1 text-sm ${
                    settings.guessLevel === level
                      ? "bg-amber-100 text-stone-700"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {GUESS_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-stone-400 text-xs">
            {DIGLOT_UI_COPY.placementStatus} 第 {settings.introductionRankFloor + 1} 位 ·{" "}
            {DIGLOT_UI_COPY.placementNote}
          </p>
          <div className="flex items-center justify-between">
            <span>{DIGLOT_UI_COPY.ttsLabel}</span>
            <button
              type="button"
              aria-label="发音开关"
              onClick={() => void saveSettings({ ttsEnabled: !settings.ttsEnabled })}
              className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${settings.ttsEnabled ? "bg-amber-500" : "bg-stone-300"}`}
            >
              <span
                className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.ttsEnabled ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>
          {settings.ttsEnabled && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">{DIGLOT_UI_COPY.piperSection}</summary>
              <div className="mt-2 space-y-2">
                <label className="block space-y-1">
                  {DIGLOT_UI_COPY.piperPathLabel}
                  <input
                    value={piperPathDraft}
                    onChange={(e) => setPiperPathDraft(e.target.value)}
                    onBlur={commitPiperPath}
                    onKeyDown={blurOnEnter}
                    className={inputClass}
                    placeholder="/usr/bin/piper(留空则用系统发音)"
                  />
                </label>
                <label className="block space-y-1">
                  {DIGLOT_UI_COPY.piperModelLabel}
                  <input
                    value={piperModelPathDraft}
                    onChange={(e) => setPiperModelPathDraft(e.target.value)}
                    onBlur={commitPiperModelPath}
                    onKeyDown={blurOnEnter}
                    className={inputClass}
                    placeholder="~/piper-voices/en_US-lessac-medium.onnx"
                  />
                </label>
              </div>
            </details>
          )}
          <p className="text-xs text-stone-300">
            词典与发音数据来自这些开源项目:CC-CEDICT · FrequencyWords · CMUdict
          </p>
        </div>
      )}
    </section>
  );
}
