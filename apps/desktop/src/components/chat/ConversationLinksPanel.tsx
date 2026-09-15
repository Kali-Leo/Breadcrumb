/**
 * Purpose: the panel where a conversation is tied to some of the reader's documents — what is
 * linked now (each removable), the saved sets to take whole, and the library to pick from.
 *
 * When the links came from a set and no longer match it, one line says so and offers the
 * two honest answers: the set follows this conversation, or this conversation goes its own
 * way. Nothing is changed behind the reader's back in either direction — a set used by other
 * conversations is only rewritten on request, and a conversation is never silently reset to
 * its set. The saved-sets section is ConversationLinksCollections.
 * Main exports: ConversationLinksPanel.
 */
import { sameDocumentSet } from "@breadcrumb/core-db";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useConversationLinksStore } from "../../stores/conversationLinksStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { ConversationLinksCollections } from "./ConversationLinksCollections";

interface ConversationLinksPanelProps {
  conversationId: string | null;
  onClose(): void;
}

const SECTION_TITLE = "text-[11px] font-medium uppercase tracking-wide text-stone-400";
/** One shared instance: a selector that returned a fresh [] each time would re-render forever. */
const NO_LINKS: readonly string[] = [];

export function ConversationLinksPanel({ conversationId, onClose }: ConversationLinksPanelProps) {
  const { t } = useTranslation(["chat", "common"]);
  const documents = useLibraryStore((state) => state.documents);
  const loadDocuments = useLibraryStore((state) => state.load);
  const linked = useConversationLinksStore(
    (state) => state.linksByConversation.get(conversationId) ?? NO_LINKS,
  );
  const boundId = useConversationLinksStore(
    (state) => state.collectionByConversation.get(conversationId) ?? null,
  );
  const collections = useConversationLinksStore((state) => state.collections);
  const setLinks = useConversationLinksStore((state) => state.setLinks);
  const setBinding = useConversationLinksStore((state) => state.setBinding);
  const updateBound = useConversationLinksStore((state) => state.updateBoundCollection);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const titleOf = (id: string) => documents.find((document) => document.id === id)?.title ?? id;
  const bound = collections.find((collection) => collection.id === boundId) ?? null;
  const drifted = bound !== null && !sameDocumentSet(bound.documentIds, linked);

  function toggle(documentId: string, on: boolean) {
    const next = on
      ? [...linked.filter((id) => id !== documentId), documentId]
      : linked.filter((id) => id !== documentId);
    void setLinks(conversationId, next);
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("chat:links.close")}
        onClick={onClose}
        className="fixed inset-0 z-20 cursor-default"
      />
      <div
        role="dialog"
        aria-label={t("chat:links.entry")}
        data-links-panel
        className="absolute bottom-full start-0 z-30 mb-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-medium text-stone-800">{t("chat:links.entry")}</h2>
            <p className="text-stone-500 text-xs">{t("chat:links.intro")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("chat:links.close")}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>

        <section className="space-y-1.5">
          <h3 className={SECTION_TITLE}>{t("chat:links.linked")}</h3>
          {linked.length === 0 ? (
            <p className="text-stone-400 text-xs">{t("chat:links.none")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" data-linked-list>
              {linked.map((id) => (
                <li
                  key={id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 py-0.5 pe-1 ps-2.5 text-amber-900 text-xs"
                >
                  <span className="truncate">{titleOf(id)}</span>
                  <button
                    type="button"
                    aria-label={t("chat:links.unlink", { title: titleOf(id) })}
                    onClick={() => toggle(id, false)}
                    className="rounded-full p-0.5 text-amber-700 hover:bg-amber-100 coarse:min-h-8 coarse:min-w-8"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {drifted && (
            <div
              data-links-drift
              className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-2 text-stone-600 text-xs"
            >
              <span className="min-w-0 flex-1">{t("chat:links.drift", { name: bound.name })}</span>
              <button
                type="button"
                onClick={() => void updateBound(conversationId)}
                className="rounded-md bg-stone-800 px-2 py-1 text-white hover:bg-stone-700 coarse:min-h-9"
              >
                {t("chat:links.updateCollection")}
              </button>
              <button
                type="button"
                onClick={() => void setBinding(conversationId, null)}
                className="rounded-md border border-stone-300 px-2 py-1 text-stone-700 hover:bg-stone-100 coarse:min-h-9"
              >
                {t("chat:links.onlyThisConversation")}
              </button>
            </div>
          )}
        </section>

        <ConversationLinksCollections conversationId={conversationId} titleOf={titleOf} />

        <section className="space-y-1">
          <h3 className={SECTION_TITLE}>{t("chat:links.documents")}</h3>
          {documents.length === 0 ? (
            <p className="text-stone-400 text-xs">{t("chat:links.noDocuments")}</p>
          ) : (
            <ul className="flex flex-col" data-document-list>
              {documents.map((document) => (
                <li key={document.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50 coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked={linked.includes(document.id)}
                      onChange={(event) => toggle(document.id, event.target.checked)}
                      className="accent-amber-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-stone-700">{document.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
