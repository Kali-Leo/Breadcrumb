/**
 * Purpose: the floating companion chat window (spec 050 §8) — binds to its conversation's
 * own session, so the main view keeps whatever it was showing and both can talk at the
 * same time without cross-wiring. Reuses the real message bubbles and composer.
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
  const session = useChatStore((state) => state.sessions.get(conversationId));
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load this conversation's own session — the active binding is untouched.
  useEffect(() => {
    void useChatStore.getState().ensureSession(conversationId);
  }, [conversationId]);

  const messages = session?.messages ?? [];
  const streamingText = session?.streamingText ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: message/stream growth is the scroll trigger
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane !== null) pane.scrollTop = pane.scrollHeight;
  }, [messages.length, streamingText]);

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
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            author={message.role}
            content={message.content}
            messageId={message.id}
          />
        ))}
        {streamingText !== null && streamingText !== "" && (
          <MessageBubble author="assistant" content={streamingText} />
        )}
        {session?.errorText != null && <p className="text-xs text-rose-500">{session.errorText}</p>}
      </div>
      <div className="border-t border-stone-100">
        <Composer
          disabled={session === undefined || streamingText !== null}
          onSend={(content) => void useChatStore.getState().sendMessage(content, conversationId)}
        />
      </div>
    </div>
  );
}
