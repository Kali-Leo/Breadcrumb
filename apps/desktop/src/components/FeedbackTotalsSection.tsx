/**
 * Purpose: the 🪞 feedback lab's "累计" section — five only-increasing totals as small cards,
 * no percentage or score anywhere (spec 035 #3, streak's core without the reset anxiety).
 * Main exports: FeedbackTotalsSection.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

function TotalCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded border border-stone-200 bg-white px-3 py-2">
      <p className="text-lg text-stone-700">{value}</p>
      <p className="text-stone-400">{label}</p>
    </div>
  );
}

export function FeedbackTotalsSection() {
  const totals = useFeedbackStore((state) => state.totals);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.totalsTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.totalsHint}</p>
      {totals !== null && (
        <div className="mt-2 flex flex-wrap gap-2">
          <TotalCard value={totals.conceptsMet} label={FEEDBACK_COPY.totalsConcepts} />
          <TotalCard value={totals.totalEncounters} label={FEEDBACK_COPY.totalsEncounters} />
          <TotalCard value={totals.wordsLearning} label={FEEDBACK_COPY.totalsWordsLearning} />
          <TotalCard value={totals.wordsSettled} label={FEEDBACK_COPY.totalsWordsSettled} />
          <TotalCard value={totals.conversationCount} label={FEEDBACK_COPY.totalsConversations} />
        </div>
      )}
    </section>
  );
}
