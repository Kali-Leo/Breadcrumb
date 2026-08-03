/**
 * Purpose: lab-panel top-of-page two-state mindset switch — 排位 (ranked) / 休闲 (casual),
 * spec 016. Neutral, zero-pressure copy: one plain sentence per mode, no "you should".
 * Main exports: LabModeToggle.
 */
import { type LearningMode, useSettingsStore } from "../stores/settingsStore";

const MODES: { value: LearningMode; label: string; hint: string }[] = [
  { value: "casual", label: "休闲", hint: "跟着好奇心走，地图自己往外长" },
  { value: "ranked", label: "排位", hint: "朝着目标推进" },
];

export function LabModeToggle() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  const setLearningMode = useSettingsStore((state) => state.setLearningMode);

  return (
    <section className="flex items-center gap-3 rounded border border-stone-200 px-2 py-1.5">
      <div className="flex overflow-hidden rounded-full border border-stone-200">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => void setLearningMode(mode.value)}
            className={`px-3 py-1 transition-colors ${
              learningMode === mode.value
                ? "bg-amber-500 text-white"
                : "bg-white text-stone-500 hover:bg-stone-50"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="text-stone-400">{MODES.find((mode) => mode.value === learningMode)?.hint}</p>
    </section>
  );
}
