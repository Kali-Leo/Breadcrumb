/**
 * Purpose: the palace context stack's self-report card (spec 047) — "I already know X" in
 * the learner's own words, mapped into the knowledge net (interest switch gates the LLM
 * call internally) and followed by a planner recompute. The user is the expert on
 * themselves; domain judgment stays the system's job.
 * Main exports: SelfReportCard.
 */
import { useState } from "react";
import { useInterestStore } from "../../stores/interestStore";
import { usePlannerStore } from "../../stores/plannerStore";

export function SelfReportCard() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (text.trim().length === 0) return;
    setSubmitting(true);
    try {
      await useInterestStore.getState().selfReportMastery(text.trim());
      await usePlannerStore.getState().recompute();
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded border border-stone-200 bg-white p-3 text-xs">
      <h3 className="font-semibold text-stone-600">告诉我你已经会的</h3>
      <div className="mt-1 flex gap-1">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="比如：我学过高中数学"
          className="flex-1 rounded border border-stone-200 px-2 py-1 outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="rounded bg-amber-500 px-2 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {submitting ? "记录中…" : "记录"}
        </button>
      </div>
    </section>
  );
}
