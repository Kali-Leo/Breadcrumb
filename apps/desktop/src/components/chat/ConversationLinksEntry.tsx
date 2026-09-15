/**
 * Purpose: the way into tying a conversation to the reader's own documents — a small control
 * beside the mode switch, carrying how many documents are linked, that opens the panel.
 *
 * It sits in the composer rather than in the library because the decision is made where the
 * question is asked: a reader about to ask about chapter three wants to say "answer from
 * this book" right there, not on another page first.
 * Main exports: ConversationLinksEntry.
 */
import { formatCount } from "@breadcrumb/core-i18n";
import { BookMarked } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConversationLinksStore } from "../../stores/conversationLinksStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { ConversationLinksPanel } from "./ConversationLinksPanel";

interface ConversationLinksEntryProps {
  /** Null is the new-conversation composer; its links move onto the conversation it births. */
  conversationId: string | null;
}

export function ConversationLinksEntry({ conversationId }: ConversationLinksEntryProps) {
  const { t, i18n } = useTranslation("chat");
  const load = useConversationLinksStore((state) => state.load);
  const count = useConversationLinksStore(
    (state) => state.linksByConversation.get(conversationId)?.length ?? 0,
  );
  const [open, setOpen] = useState(false);
  // A document removed from the library took its links with it (libraryRepository's
  // cascade); the list changing is the cue to read the row again.
  const documentCount = useLibraryStore((state) => state.documents.length);

  useEffect(() => {
    if (documentCount >= 0) void load(conversationId);
  }, [load, conversationId, documentCount]);

  return (
    <div className="relative">
      <button
        type="button"
        data-hint="chatLinks"
        data-links-entry
        aria-expanded={open}
        aria-label={t("links.entry")}
        title={t("links.entry")}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs shadow-sm transition-colors coarse:min-h-11 ${
          count > 0
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-stone-300 bg-white text-stone-500 hover:bg-stone-50"
        }`}
      >
        <BookMarked size={14} strokeWidth={1.8} />
        {count > 0 && <span className="tabular-nums">{formatCount(i18n.language, count)}</span>}
      </button>
      {open && (
        <ConversationLinksPanel conversationId={conversationId} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
