/**
 * Purpose: the focus overlay's guess-gate card (spec 042 §3) — shown at the top of the content
 * pane when the gate opens on a selected word; submitting grades the guess (when the word
 * matches a known concept) and either way moves on to the new station's explanation.
 * Main exports: FocusGuessCard.
 */
import { EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { useState } from "react";

export function FocusGuessCard({
  word,
  onSubmit,
  onSkip,
}: {
  word: string;
  onSubmit: (guessText: string) => void;
  onSkip: () => void;
}) {
  const [guessText, setGuessText] = useState("");

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
      <p className="text-xs text-stone-400">
        {EXPLORE_UI_COPY.doorGuessPrompt}（「{word}」）
      </p>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (guessText.trim().length === 0) return;
          onSubmit(guessText);
        }}
      >
        <input
          // biome-ignore lint/a11y/noAutofocus: the card exists to receive this input
          autoFocus
          value={guessText}
          onChange={(event) => setGuessText(event.target.value)}
          className="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1 text-sm"
          placeholder={EXPLORE_UI_COPY.doorGuessPlaceholder}
        />
        <button
          type="submit"
          disabled={guessText.trim().length === 0}
          className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 disabled:opacity-40"
        >
          {EXPLORE_UI_COPY.doorGuessSubmit}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          {EXPLORE_UI_COPY.focusGuessSkipButton}
        </button>
      </form>
    </div>
  );
}
