/**
 * Purpose: the 🪞 feedback lab's "微进展" section — concrete, dated things that happened
 * today and in the last 7 days (new concepts, reencounters, word guesses, teach sessions).
 * Main exports: FeedbackSmallWinsSection.
 */
import { FEEDBACK_COPY, type SmallWin } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

function SmallWinList({ wins }: { wins: SmallWin[] }) {
  if (wins.length === 0) {
    return <p className="text-stone-400">{FEEDBACK_COPY.smallWinsEmpty}</p>;
  }
  return (
    <ul className="space-y-1">
      {wins.map((win) => (
        <li
          key={`${win.kind}-${win.label}-${win.occurredAtIso}`}
          className="rounded border border-stone-200 px-2 py-1 text-stone-600"
        >
          {win.label}
        </li>
      ))}
    </ul>
  );
}

export function FeedbackSmallWinsSection() {
  const today = useFeedbackStore((state) => state.smallWinsToday);
  const week = useFeedbackStore((state) => state.smallWinsWeek);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.smallWinsTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.smallWinsHint}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-stone-500">{FEEDBACK_COPY.smallWinsTodayLabel}</p>
          <SmallWinList wins={today} />
        </div>
        <div>
          <p className="mb-1 text-stone-500">{FEEDBACK_COPY.smallWinsWeekLabel}</p>
          <SmallWinList wins={week} />
        </div>
      </div>
    </section>
  );
}
