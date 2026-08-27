/**
 * Purpose: the palace's 休闲/目标 mode switch (spec 016; restored at the map's top-left by
 * spec 048 §3, Leo's original design) — casual recommends naturally by curiosity, ranked
 * recommends toward the chosen goal. Switching recomputes the planner so recommendations
 * follow immediately.
 * Main exports: MapModeToggle.
 */

import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";
import { type LearningMode, useSettingsStore } from "../../stores/settingsStore";

export function MapModeToggle() {
  const { t } = useTranslation(["palace", "common"]);
  const learningMode = useSettingsStore((state) => state.learningMode);
  const setLearningMode = useSettingsStore((state) => state.setLearningMode);

  async function switchTo(mode: LearningMode) {
    if (mode === learningMode) return;
    await setLearningMode(mode);
    await usePlannerStore.getState().recompute();
  }

  return (
    <div className="flex overflow-hidden rounded-full border border-stone-300 bg-white/90 text-xs shadow-sm">
      {(
        [
          ["casual", t("palace:map.modeCasual"), t("palace:map.modeCasualHint")],
          ["ranked", t("palace:map.modeRanked"), t("palace:map.modeRankedHint")],
        ] as const
      ).map(([mode, label, title]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={learningMode === mode}
          onClick={() => void switchTo(mode)}
          title={title}
          className={`px-3 py-1 transition-colors ${
            learningMode === mode ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
