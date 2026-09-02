/**
 * Purpose: the focus overlay's guess-gate card (spec 042 §3) — shown at the top of the content
 * pane when the gate opens on a selected word; submitting grades the guess (when the word
 * matches a known concept) and either way moves on to the new station's explanation.
 * Main exports: FocusGuessCard.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function FocusGuessCard({
  word,
  onSubmit,
  onSkip,
}: {
  word: string;
  onSubmit: (guessText: string) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation(["learning", "common"]);
  const [guessText, setGuessText] = useState("");

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
      <p className="text-xs text-stone-400">
        {t("learning:door.guessPrompt")}（「{word}」）
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
          placeholder={t("learning:door.guessPlaceholder")}
        />
        <button
          type="submit"
          disabled={guessText.trim().length === 0}
          className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 disabled:opacity-40"
        >
          {t("learning:door.guessSubmit")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          {t("learning:focus.guessSkipButton")}
        </button>
      </form>
    </div>
  );
}
