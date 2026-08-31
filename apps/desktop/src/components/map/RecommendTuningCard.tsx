/**
 * Purpose: the palace left rail's 推荐偏好 card (spec 060 §3) — five life-language sliders
 * over the frontier component weights, Leo's ruling: all of them user-tunable, phrased in
 * the learner's language, never ours. No numbers, no component names, no algorithm words on
 * screen; the slider position is the whole interface. Changes write through to settings and
 * recompute the planner.
 * Main exports: RecommendTuningCard.
 */
import { FRONTIER_WEIGHTS, type FrontierWeights } from "@breadcrumb/plugin-planner";
import { useTranslation } from "react-i18next";
import { RECOMMENDATION_WEIGHT_MAX } from "../../lib/recommendationWeights";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";

/** goalGap only matters in ranked mode, where a goal exists to weigh toward. */
const SLIDER_ORDER: (keyof FrontierWeights)[] = [
  "interest",
  "helps",
  "difficulty",
  "goalGap",
  "browsing",
];

export function RecommendTuningCard() {
  const { t } = useTranslation("palace");
  const weights = useSettingsStore((state) => state.recommendationWeights);
  const learningMode = useSettingsStore((state) => state.learningMode);

  async function apply(next: FrontierWeights): Promise<void> {
    await useSettingsStore.getState().setRecommendationWeights(next);
    void usePlannerStore.getState().recompute();
  }

  const shown = SLIDER_ORDER.filter(
    (component) => component !== "goalGap" || learningMode === "ranked",
  );
  const isDefault = shown.every((component) => weights[component] === FRONTIER_WEIGHTS[component]);

  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="font-semibold text-stone-600">{t("tuning.title")}</h3>
      <p className="mt-1 text-stone-400">{t("tuning.intro")}</p>
      <ul className="mt-2 space-y-2">
        {shown.map((component) => (
          <li key={component}>
            <label className="block text-stone-600">
              {t(`tuning.${component}`)}
              <input
                type="range"
                min={0}
                max={RECOMMENDATION_WEIGHT_MAX}
                step={0.05}
                value={weights[component]}
                onChange={(event) =>
                  void apply({ ...weights, [component]: Number(event.target.value) })
                }
                className="mt-0.5 block w-full accent-amber-500"
              />
            </label>
          </li>
        ))}
      </ul>
      {!isDefault && (
        <button
          type="button"
          onClick={() => void apply({ ...FRONTIER_WEIGHTS })}
          className="mt-2 rounded border border-stone-200 px-2 py-1 text-stone-500 transition-colors hover:border-amber-400 hover:bg-amber-50"
        >
          {t("tuning.reset")}
        </button>
      )}
    </section>
  );
}
