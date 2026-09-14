/**
 * Purpose: the palace left rail's 推荐偏好 card — three sliders over the intent-level
 * recommendation weights, each shown as a lean between two RESULTS the learner can picture
 * ("more challenging" … "easier"), never as a parameter ("ignored" … "preferred"). The
 * middle of every slider is the shipped default and says so. Interest is ONE slider —
 * conversation and watched-video signals both live under it (their internal split is the
 * system's adaptive trust ratio, not a knob). No numbers, no component names, no algorithm
 * words on screen.
 * Main exports: RecommendTuningCard.
 */
import { useTranslation } from "react-i18next";
import {
  leanToWeight,
  USER_WEIGHT_DEFAULTS,
  type UserRecommendationWeights,
  weightToLean,
} from "../../lib/planner/recommendationWeights";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";

/** goalGap is not a slider: inside a goal everything is toward it, so the weight keeps its
 * default and the learner tunes the three factors that actually trade off. */
const SLIDER_ORDER = [
  "interest",
  "helps",
  "difficulty",
] as const satisfies readonly (keyof UserRecommendationWeights)[];

/** Five stops: both ends, both halves, and the default in the middle — few enough that every
 * stop is a distinct list, and the middle is easy to land on again. */
const LEAN_STEP = 0.5;

const END_LABEL = "min-w-0 flex-1 basis-0";
const CURRENT = "font-medium text-stone-700";

export function RecommendTuningCard() {
  const { t } = useTranslation("palace");
  const weights = useSettingsStore((state) => state.recommendationWeights);

  async function apply(next: UserRecommendationWeights): Promise<void> {
    await useSettingsStore.getState().setRecommendationWeights(next);
    void usePlannerStore.getState().recompute();
  }

  const isDefault = SLIDER_ORDER.every(
    (component) => weights[component] === USER_WEIGHT_DEFAULTS[component],
  );

  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="font-semibold text-stone-600">{t("tuning.title")}</h3>
      <p className="mt-1 text-stone-400">{t("tuning.intro")}</p>
      <ul className="mt-2 space-y-3">
        {SLIDER_ORDER.map((component) => {
          const lean = weightToLean(component, weights[component]);
          const low = t(`tuning.${component}.low`);
          const high = t(`tuning.${component}.high`);
          const current = lean < 0 ? low : lean > 0 ? high : t("tuning.default");
          return (
            <li key={component}>
              <input
                type="range"
                min={-1}
                max={1}
                step={LEAN_STEP}
                value={lean}
                aria-label={`${low} / ${high}`}
                aria-valuetext={current}
                onChange={(event) =>
                  void apply({
                    ...weights,
                    [component]: leanToWeight(component, Number(event.target.value)),
                  })
                }
                className="lean-slider block w-full cursor-pointer"
              />
              <div className="flex gap-1 text-[10px] text-stone-400" aria-hidden="true">
                <span className={`${END_LABEL} text-start ${lean < 0 ? CURRENT : ""}`}>{low}</span>
                <span className={`shrink-0 ${lean === 0 ? CURRENT : ""}`}>
                  {t("tuning.default")}
                </span>
                <span className={`${END_LABEL} text-end ${lean > 0 ? CURRENT : ""}`}>{high}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {!isDefault && (
        <button
          type="button"
          onClick={() => void apply({ ...USER_WEIGHT_DEFAULTS })}
          className="mt-2 rounded border border-stone-200 px-2 py-1 text-stone-500 transition-colors hover:border-amber-400 hover:bg-amber-50"
        >
          {t("tuning.reset")}
        </button>
      )}
    </section>
  );
}
