/**
 * Purpose: sidebar conversation list — a quiet search box on top (Leo-approved 2026-08-16;
 * WeChat/ChatGPT's pattern for histories that grow for months), then plain time order with
 * trail-card display names (auto "首站 → 末站" unless the user renamed). Topic grouping
 * (trailGrouping.ts) was wired in spec 044 and reverted the same day: Leo judged the group
 * headers + preview/group duplication made the list unreadable.
 * Main exports: TrailList.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
import { useState } from "react";
import { displayTrailTitle } from "../lib/trailNaming";
import { useChatStore } from "../stores/chatStore";

interface TrailListProps {
  isChatViewActive: boolean;
  onOpenChat(): void;
}

export function TrailList({ isChatViewActive, onOpenChat }: TrailListProps) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openConversation = useChatStore((state) => state.openConversation);
  const [query, setQuery] = useState("");

  function open(conversation: ConversationRow) {
    void openConversation(conversation.id);
    onOpenChat();
  }

  const trimmedQuery = query.trim().toLowerCase();
  const visibleConversations =
    trimmedQuery === ""
      ? conversations
      : conversations.filter((conversation) =>
          displayTrailTitle(conversation).toLowerCase().includes(trimmedQuery),
        );

  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索对话"
        aria-label="搜索对话"
        className="mb-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 placeholder:text-stone-400 focus:border-amber-300 focus:outline-none"
      />
      {visibleConversations.map((conversation) => {
        const active = conversation.id === activeConversationId && isChatViewActive;
        return (
          <button
            type="button"
            key={conversation.id}
            onClick={() => open(conversation)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              active ? "bg-amber-100 text-stone-800" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {displayTrailTitle(conversation)}
          </button>
        );
      })}
      {trimmedQuery !== "" && visibleConversations.length === 0 && (
        <p className="px-3 py-2 text-sm text-stone-400">没有找到相关对话</p>
      )}
    </div>
  );
}
