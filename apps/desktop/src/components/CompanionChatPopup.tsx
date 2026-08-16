/**
 * Purpose: the floating companion chat window (spec 050 §8, Leo: talking to a helper must
 * not take over the main chat view) — a small fixed panel over the center area that binds
 * the chat store to the helper's conversation while open and restores the previous
 * conversation on close. Reuses the real message bubbles and composer.
 * Main exports: CompanionChatPopup.
 */
import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";

interface CompanionChatPopupProps {
  conversationId: string;
  title: string;
  onClose(): void;
}

export function CompanionChatPopup({ conversationId, title, onClose }: CompanionChatPopupProps) {
  const messages = useChatStore((state) => state.messages);
  const streamingText = useChatStore((state) => state.streamingText);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const previousConversationIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Bind the store to the helper's conversation for the popup's lifetime; hand the
  // previous conversation back on close so the main view is untouched by the visit.
  useEffect(() => {
    previousConversationIdRef.current = useChatStore.getState().activeConversationId;
    void useChatStore.getState().openConversation(conversationId);
    return () => {
      const previous = previousConversationIdRef.current;
      if (previous !== null && previous !== conversationId) {
        void useChatStore.getState().openConversation(previous);
      }
    };
  }, [conversationId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: message/stream growth is the scroll trigger
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane !== null) pane.scrollTop = pane.scrollHeight;
  }, [messages.length, streamingText]);

  const bound = activeConversationId === conversationId;

  return (
    <div className="absolute bottom-3 right-3 z-40 flex h-[26rem] w-96 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
        <span className="truncate text-sm font-medium text-stone-700">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭对话窗口"
          className="rounded px-2 text-stone-400 hover:bg-stone-100"
        >
          ✕
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-stone-50 p-3 text-sm">
        {bound &&
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              author={message.role}
              content={message.content}
              messageId={message.id}
            />
          ))}
        {bound && streamingText !== null && streamingText !== "" && (
          <MessageBubble author="assistant" content={streamingText} />
        )}
      </div>
      <div className="border-t border-stone-100">
        <Composer
          disabled={!bound || streamingText !== null}
          onSend={(content) => void useChatStore.getState().sendMessage(content)}
        />
      </div>
    </div>
  );
}
