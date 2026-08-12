/**
 * Purpose: settings section for the diglot weave (spec 033 T10) — enable switch, pair
 * display, density slider, new-word pace, guess level (no "off": the gate is part of the
 * mechanism), TTS config. All local, zero token cost.
 * Main exports: DiglotSettingsSection.
 */
import { GUESS_LEVEL_BASE, type GuessLevel } from "@breadcrumb/plugin-diglot-weave";
import { useDiglotStore } from "../stores/diglotStore";

const GUESS_LEVEL_LABELS: Record<GuessLevel, string> = {
  low: "少",
  standard: "标准",
  high: "多",
};

export function DiglotSettingsSection() {
  const settings = useDiglotStore((state) => state.settings);
  const saveSettings = useDiglotStore((state) => state.saveSettings);
  const cardsByLemma = useDiglotStore((state) => state.cardsByLemma);
  const newToday = useDiglotStore((state) => state.newWordsIntroducedToday);

  const inputClass =
    "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-stone-700">语言织入(学外语)</h3>
          <p className="text-xs text-stone-400">
            对话里少量词语显示为目标语言;原文不变,随时可关。全程本地,零 token。
          </p>
        </div>
        <button
          type="button"
          aria-label="语言织入开关"
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
            语对:中文 → English · 学习中 {cardsByLemma.size} 词 · 今日新词 {newToday}
          </p>
          <label className="block space-y-1">
            替换密度 {(settings.density * 100).toFixed(0)}%
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
            每日新词上限 {settings.newWordDailyBase}
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
            <span>猜测频率</span>
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
          <div className="flex items-center justify-between">
            <span>发音(本地 TTS)</span>
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
              <summary className="cursor-pointer">Piper 高质量发音(可选)</summary>
              <div className="mt-2 space-y-2">
                <label className="block space-y-1">
                  piper 可执行文件路径
                  <input
                    value={settings.piperPath}
                    onChange={(e) => void saveSettings({ piperPath: e.target.value })}
                    className={inputClass}
                    placeholder="/usr/bin/piper(留空则用系统发音)"
                  />
                </label>
                <label className="block space-y-1">
                  voice 模型路径(.onnx)
                  <input
                    value={settings.piperModelPath}
                    onChange={(e) => void saveSettings({ piperModelPath: e.target.value })}
                    className={inputClass}
                    placeholder="~/piper-voices/en_US-lessac-medium.onnx"
                  />
                </label>
              </div>
            </details>
          )}
          <p className="text-xs text-stone-300">
            词典数据:CC-CEDICT · FrequencyWords · CMUdict(CC BY-SA / BSD)
          </p>
        </div>
      )}
    </section>
  );
}
