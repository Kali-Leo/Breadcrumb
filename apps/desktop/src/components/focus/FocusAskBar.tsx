/**
 * Purpose: the focus overlay's bottom "ask about the current station" input (spec 042 §3) —
 * a dashed diagonal question station on submit. While a stream is in flight, typing stays
 * possible but submit waits (single-buffer guard) and a 停止 button appears instead.
 * Main exports: FocusAskBar.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusStore } from "../../stores/focusStore";

export function FocusAskBar({ onAsk }: { onAsk: (question: string) => void }) {
  const { t } = useTranslation(["learning", "common"]);
  const [draft, setDraft] = useState("");
  const streaming = useFocusStore((state) => state.streamingText !== null);

  return (
    <form
      className="flex shrink-0 gap-2 border-stone-200 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        // A submit during a stream is dropped, not queued — and the text stays put so
        // nothing typed is lost. Stop first, then ask.
        if (streaming || draft.trim().length === 0) return;
        onAsk(draft);
        setDraft("");
      }}
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("learning:focus.askPlaceholder")}
        className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm coarse:min-h-11 coarse:text-base"
      />
      {streaming && (
        <button
          type="button"
          onClick={() => useFocusStore.getState().stopStreaming()}
          className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-stone-700 coarse:min-h-11 coarse:min-w-11 coarse:px-4 hover:bg-amber-200"
        >
          {t("common:actions.stop")}
        </button>
      )}
      <button
        type="submit"
        disabled={streaming || draft.trim().length === 0}
        className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-stone-700 coarse:min-h-11 coarse:min-w-11 coarse:px-4 disabled:opacity-40"
      >
        {t("common:actions.send")}
      </button>
    </form>
  );
}
