/**
 * Purpose: the focus overlay's bottom "ask about the current station" input (spec 042 §3) —
 * a dashed diagonal question station on submit.
 * Main exports: FocusAskBar.
 */
import { EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { useState } from "react";

export function FocusAskBar({ onAsk }: { onAsk: (question: string) => void }) {
  const [draft, setDraft] = useState("");

  return (
    <form
      className="flex shrink-0 gap-2 border-stone-200 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim().length === 0) return;
        onAsk(draft);
        setDraft("");
      }}
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={EXPLORE_UI_COPY.focusAskPlaceholder}
        className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={draft.trim().length === 0}
        className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-40"
      >
        发送
      </button>
    </form>
  );
}
