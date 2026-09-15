/**
 * Purpose: the saved sets inside the linking panel — each one taken whole with a click,
 * renamed in place, or removed. The sets are named by the product (collectionName.ts) and
 * this is the one place the reader can correct that name.
 * Main exports: ConversationLinksCollections.
 */
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConversationLinksStore } from "../../stores/conversationLinksStore";

interface ConversationLinksCollectionsProps {
  conversationId: string | null;
  titleOf(documentId: string): string;
}

const ICON_BUTTON =
  "rounded p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-600 focus-visible:opacity-100 group-hover:opacity-100 coarse:min-h-9 coarse:min-w-9 coarse:opacity-100 opacity-0 transition-opacity";

export function ConversationLinksCollections({
  conversationId,
  titleOf,
}: ConversationLinksCollectionsProps) {
  const { t } = useTranslation(["chat", "common"]);
  const collections = useConversationLinksStore((state) => state.collections);
  const boundId = useConversationLinksStore(
    (state) => state.collectionByConversation.get(conversationId) ?? null,
  );
  const apply = useConversationLinksStore((state) => state.applyCollection);
  const rename = useConversationLinksStore((state) => state.renameCollection);
  const remove = useConversationLinksStore((state) => state.deleteCollection);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function commitRename() {
    if (renamingId !== null) void rename(renamingId, draft);
    setRenamingId(null);
  }

  return (
    <section className="space-y-1">
      <h3 className="font-medium text-[11px] text-stone-400 uppercase tracking-wide">
        {t("chat:links.collections")}
      </h3>
      {collections.length === 0 ? (
        <p className="text-stone-400 text-xs">{t("chat:links.noCollections")}</p>
      ) : (
        <ul className="flex flex-col" data-collection-list>
          {collections.map((collection) =>
            renamingId === collection.id ? (
              <li key={collection.id} className="px-1 py-1">
                <input
                  value={draft}
                  aria-label={t("chat:trail.rename")}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  // biome-ignore lint/a11y/noAutofocus: the row turned into this field on request.
                  autoFocus
                  className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm text-stone-800 focus:outline-none coarse:text-base"
                />
              </li>
            ) : (
              <li
                key={collection.id}
                className="group flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-stone-50"
              >
                <button
                  type="button"
                  aria-label={t("chat:links.apply", { name: collection.name })}
                  aria-pressed={boundId === collection.id}
                  title={collection.documentIds.map(titleOf).join(t("common:list.separator"))}
                  onClick={() => void apply(conversationId, collection.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-1.5 py-1 text-start coarse:min-h-11 ${
                    boundId === collection.id ? "text-amber-800" : "text-stone-700"
                  }`}
                >
                  {collection.name}
                  <span className="ms-1.5 text-stone-400 text-xs tabular-nums">
                    {collection.documentIds.length}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("chat:trail.rename")}
                  title={t("chat:trail.rename")}
                  onClick={() => {
                    setDraft(collection.name);
                    setRenamingId(collection.id);
                  }}
                  className={ICON_BUTTON}
                >
                  <Pencil size={13} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  aria-label={t("chat:trail.delete")}
                  title={t("chat:trail.delete")}
                  onClick={() => void remove(collection.id)}
                  className={ICON_BUTTON}
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
