/**
 * Purpose: the 🪞 feedback lab's "讲解模式记录" section — a plain per-mode turn count, record
 * only, never framed as one mode outperforming another.
 * Main exports: FeedbackTeachingModeSection.
 */
import { FEEDBACK_COPY, teachingModeLine } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

const MODE_LABELS: Record<"adaptive" | "direct" | "guided", string> = {
  adaptive: "自动",
  direct: "直给",
  guided: "引导",
};

export function FeedbackTeachingModeSection() {
  const teachingModeUsage = useFeedbackStore((state) => state.teachingModeUsage);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.teachingModeTitle}</h3>
      {teachingModeUsage.total === 0 ? (
        <p className="mt-1 text-stone-400">{FEEDBACK_COPY.teachingModeEmpty}</p>
      ) : (
        <div className="mt-1 space-y-1 text-stone-600">
          {(Object.keys(MODE_LABELS) as Array<keyof typeof MODE_LABELS>)
            .filter((mode) => teachingModeUsage[mode] > 0)
            .map((mode) => (
              <p key={mode}>{teachingModeLine(MODE_LABELS[mode], teachingModeUsage[mode])}</p>
            ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.teachingModeBasis}</p>
    </section>
  );
}
