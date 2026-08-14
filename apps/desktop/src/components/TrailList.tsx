/**
 * Purpose: sidebar conversation list — plain time order (Leo 2026-08-14: left is time, the
 * node structure lives in the right-side station map), with trail-card display names
 * (auto "首站 → 末站" unless the user renamed). Topic grouping (trailGrouping.ts) stays
 * available but unwired.
 * Main exports: TrailList.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
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

  function open(conversation: ConversationRow) {
    void openConversation(conversation.id);
    onOpenChat();
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => {
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
    </div>
  );
}
