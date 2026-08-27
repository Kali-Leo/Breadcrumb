/**
 * Purpose: the floating companion chat window (spec 050 §8) — binds to its conversation's
 * own session, so the main view keeps whatever it was showing and both can talk at the
 * same time without cross-wiring. Reuses the real message bubbles and composer.
 * Main exports: CompanionChatPopup.
 */

import { CRISIS_RESPONSE } from "@breadcrumb/plugin-companion";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../i18n/useCopyMessage";
import { useChatStore } from "../stores/chatStore";
import { useCompanionStore } from "../stores/companionStore";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { BackToBottomPill, useScrollPinning } from "./scrollPinning";

interface CompanionChatPopupProps {
  conversationId: string;
  title: string;
  onClose(): void;
}

export function CompanionChatPopup({ conversationId, title, onClose }: CompanionChatPopupProps) {
  const { t } = useTranslation(["chat", "common"]);
  const copy = useCopyMessage();

  const session = useChatStore((state) => state.sessions.get(conversationId));
  const draft = useChatStore((state) => state.drafts.get(conversationId) ?? "");
  const setDraft = useChatStore((state) => state.setDraft);
  const crisisHere = useCompanionStore((state) => state.crisisConversationIds.has(conversationId));
  const { containerRef, pinned, handleScroll, scrollToBottom } = useScrollPinning();

  // Load this conversation's own session — the active binding is untouched.
  useEffect(() => {
    void useChatStore.getState().ensureSession(conversationId);
  }, [conversationId]);

  const messages = session?.messages ?? [];
  const streamingText = session?.streamingText ?? null;
  const streaming = streamingText !== null;

  // Auto-scroll only while pinned near the bottom — reading upward stays undisturbed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: message/stream growth is the scroll trigger
  useEffect(() => {
    if (pinned) scrollToBottom();
  }, [messages.length, streamingText, pinned, scrollToBottom]);

  return (
    <div className="absolute bottom-3 right-3 z-40 flex h-[26rem] w-96 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
        <span className="truncate text-sm font-medium text-stone-700">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("popup.close")}
          className="rounded px-2 text-stone-400 hover:bg-stone-100"
        >
          ✕
        </button>
      </div>
      {crisisHere && (
        <div className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-stone-700">
          <p>{CRISIS_RESPONSE}</p>
          <button
            type="button"
            onClick={() => useCompanionStore.getState().dismissCrisis(conversationId)}
            className="mt-1 text-stone-400 underline"
          >
            {t("common:actions.gotIt")}
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full space-y-3 overflow-y-auto bg-stone-50 p-3 text-sm"
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              conversationId={conversationId}
              author={message.role}
              content={message.content}
              messageId={message.id}
            />
          ))}
          {streamingText !== null && streamingText !== "" && (
            <MessageBubble
              author="assistant"
              conversationId={conversationId}
              content={streamingText}
            />
          )}
          {(session?.errorText != null || (!streaming && messages.at(-1)?.role === "user")) && (
            <p className="text-xs text-rose-500">
              {session?.errorText ? copy(session.errorText) : t("noReplyYet")}
              {!streaming && messages.at(-1)?.role === "user" && (
                <button
                  type="button"
                  onClick={() => void useChatStore.getState().retryRound(conversationId)}
                  className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-stone-700 hover:bg-amber-200"
                >
                  {t("common:actions.retry")}
                </button>
              )}
            </p>
          )}
        </div>
        {!pinned && (messages.length > 0 || streaming) && (
          <BackToBottomPill onClick={scrollToBottom} />
        )}
      </div>
      <div className="border-t border-stone-100">
        <Composer
          conversationId={conversationId}
          value={draft}
          streaming={streaming}
          disabled={session === undefined}
          onChange={(text) => setDraft(conversationId, text)}
          onSend={(content) => void useChatStore.getState().sendMessage(content, conversationId)}
          onStop={() => useChatStore.getState().stopStreaming(conversationId)}
        />
      </div>
    </div>
  );
}
