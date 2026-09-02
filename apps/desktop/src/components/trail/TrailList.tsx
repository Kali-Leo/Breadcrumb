/**
 * Purpose: sidebar conversation list — a quiet search box on top (Leo-approved 2026-08-16;
 * WeChat/ChatGPT's pattern for histories that grow for months), then plain time order with
 * trail-card display names (auto "首站 → 末站" unless the user renamed). Each row carries the
 * rename/delete pair every chat history has, kept out of sight until the pointer is on the
 * row. Topic grouping (trailGrouping.ts) was wired in spec 044 and reverted the same day: Leo
 * judged the group headers + preview/group duplication made the list unreadable.
 * Main exports: TrailList.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { displayTrailTitle } from "../../lib/trail/trailNaming";
import { useChatStore } from "../../stores/chatStore";

interface TrailListProps {
  isChatViewActive: boolean;
  onOpenChat(): void;
}

export function TrailList({ isChatViewActive, onOpenChat }: TrailListProps) {
  const { t } = useTranslation(["chat", "common"]);

  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openConversation = useChatStore((state) => state.openConversation);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const [query, setQuery] = useState("");
  /** Which row's menu is open, which row is being renamed, which is being confirmed — one at
   * a time, so the list never has two half-finished actions in it. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const renameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null) renameInput.current?.select();
  }, [renamingId]);

  function open(conversation: ConversationRow) {
    void openConversation(conversation.id);
    onOpenChat();
  }

  function startRename(conversation: ConversationRow) {
    setMenuFor(null);
    setConfirmingId(null);
    setRenamingId(conversation.id);
    setDraftTitle(displayTrailTitle(conversation));
  }

  function commitRename() {
    if (renamingId !== null) void renameConversation(renamingId, draftTitle);
    setRenamingId(null);
  }

  const trimmedQuery = query.trim().toLowerCase();
  const visibleConversations =
    trimmedQuery === ""
      ? conversations
      : conversations.filter((conversation) =>
          displayTrailTitle(conversation).toLowerCase().includes(trimmedQuery),
        );

  return (
    <div data-tour="trail" className="space-y-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("trail.search")}
        aria-label={t("trail.search")}
        className="mb-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 placeholder:text-stone-400 focus:border-amber-300 focus:outline-none"
      />
      {visibleConversations.map((conversation) => {
        const active = conversation.id === activeConversationId && isChatViewActive;
        const name = displayTrailTitle(conversation);

        if (renamingId === conversation.id) {
          return (
            <input
              key={conversation.id}
              ref={renameInput}
              value={draftTitle}
              aria-label={t("trail.rename")}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setRenamingId(null);
              }}
              // biome-ignore lint/a11y/noAutofocus: the row turned into this field on request.
              autoFocus
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none"
            />
          );
        }

        return (
          <div key={conversation.id} className="group relative">
            <button
              type="button"
              onClick={() => open(conversation)}
              className={`block w-full truncate rounded-lg py-2 pe-9 ps-3 text-start text-sm transition-colors ${
                active ? "bg-amber-100 text-stone-800" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {name}
            </button>
            <button
              type="button"
              aria-label={t("trail.more", { name })}
              onClick={() => setMenuFor(menuFor === conversation.id ? null : conversation.id)}
              className={`absolute end-1 top-1.5 rounded-md px-1.5 py-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600 ${
                menuFor === conversation.id
                  ? ""
                  : "opacity-0 group-hover:opacity-100 focus:opacity-100"
              }`}
            >
              ⋯
            </button>
            {menuFor === conversation.id && (
              <>
                <button
                  type="button"
                  aria-label={t("common:actions.cancel")}
                  onClick={() => {
                    setMenuFor(null);
                    setConfirmingId(null);
                  }}
                  className="fixed inset-0 z-20 cursor-default"
                />
                <div className="absolute end-1 top-9 z-30 w-44 rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => startRename(conversation)}
                    className="block w-full rounded-lg px-3 py-2 text-start text-sm text-stone-700 hover:bg-stone-100"
                  >
                    {t("trail.rename")}
                  </button>
                  {confirmingId === conversation.id ? (
                    <div className="space-y-1 px-3 py-2">
                      <p className="text-xs text-stone-500">{t("trail.deleteConfirm")}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          setConfirmingId(null);
                          void deleteConversation(conversation.id);
                        }}
                        className="w-full rounded-lg bg-stone-800 px-3 py-1.5 text-sm text-white"
                      >
                        {t("trail.deleteAction")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(conversation.id)}
                      className="block w-full rounded-lg px-3 py-2 text-start text-sm text-stone-700 hover:bg-stone-100"
                    >
                      {t("trail.delete")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
      {trimmedQuery !== "" && visibleConversations.length === 0 && (
        <p className="px-3 py-2 text-sm text-stone-400">{t("trail.noMatches")}</p>
      )}
    </div>
  );
}
