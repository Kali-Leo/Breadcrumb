/**
 * Purpose: the 🪞 feedback lab's "今日一份" section — one status line plus two small dot
 * rows (filled = done, hollow = not yet), purely visual, no button and no next-day nagging.
 * Main exports: FeedbackDailyBiteSection.
 */
import { dailyBiteLine, FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

function DotRow({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-stone-400">{label}</span>
      <div className="flex gap-1">
        {/* Positional dots with no data identity of their own beyond order (count only),
         * and the list is always fully replaced on re-render — index is the only key. */}
        {Array.from({ length: total }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative dot row, no item identity beyond position
            key={`${label}-dot-${index}`}
            className={`h-2.5 w-2.5 rounded-full border border-amber-400 ${
              index < done ? "bg-amber-400" : "bg-transparent"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function FeedbackDailyBiteSection() {
  const dailyBite = useFeedbackStore((state) => state.dailyBite);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.dailyBiteTitle}</h3>
      {dailyBite !== null && (
        <>
          <p className="mt-1 text-stone-600">
            {dailyBiteLine(
              dailyBite.reunionsDone,
              dailyBite.newDone,
              dailyBite.reunionTarget,
              dailyBite.newTarget,
            )}
          </p>
          <div className="mt-2 space-y-1">
            <DotRow
              done={dailyBite.reunionsDone}
              total={dailyBite.reunionTarget}
              label={FEEDBACK_COPY.dailyBiteReunionLabel}
            />
            <DotRow
              done={dailyBite.newDone}
              total={dailyBite.newTarget}
              label={FEEDBACK_COPY.dailyBiteNewLabel}
            />
          </div>
        </>
      )}
      <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.dailyBiteBasis}</p>
    </section>
  );
}
