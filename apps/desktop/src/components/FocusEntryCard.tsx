/**
 * Purpose: renders one focus session's exit record inside the ordinary message list (spec 042
 * §5) — the local record text plus a button that reopens the whole session (map and content
 * both restored as they were).
 * Main exports: FocusEntryCard.
 */

import { useTranslation } from "react-i18next";
import { useFocusStore } from "../stores/focusStore";

export function FocusEntryCard({ content, sessionId }: { content: string; sessionId: string }) {
  const { t } = useTranslation(["learning", "common"]);
  const reopen = useFocusStore((state) => state.reopen);
  return (
    <div className="flex justify-start">
      <div className="max-w-[76%] space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[15px] text-stone-800 leading-relaxed">
        <p className="whitespace-pre-wrap">{content}</p>
        <button
          type="button"
          onClick={() => void reopen(sessionId)}
          className="rounded-lg bg-amber-100 px-2.5 py-1 text-stone-700 text-xs hover:bg-amber-200"
        >
          {t("learning:focus.entryReturnButton")}
        </button>
      </div>
    </div>
  );
}
