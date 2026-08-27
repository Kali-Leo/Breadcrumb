/**
 * Purpose: center column — message history, streaming reply, gentle error banner, composer.
 * Also renders the mid-tree continuation banner and handles station-map "locate" clicks —
 * scroll-into-view plus a brief highlight, resuming onto the target's branch first when it
 * isn't on the active path (spec 040 §§2-3).
 * Main exports: ChatView.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../i18n/useCopyMessage";
import { newestLeafId } from "../lib/messageTree";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useFactcheckStore } from "../stores/factcheckStore";
import { useFocusSessionsStore } from "../stores/focusSessionsStore";
import { CompanionChatBanners } from "./CompanionChatBanners";
import { Composer } from "./Composer";
import { FactcheckBadge } from "./FactcheckBadge";
import { FocusEntryCard } from "./FocusEntryCard";
import { FocusSessionBadge } from "./FocusSessionBadge";
import { FocusSessionsBar } from "./FocusSessionsBar";
import { MessageBubble } from "./MessageBubble";
import { BackToBottomPill, useScrollPinning } from "./scrollPinning";

/** How long a located message stays highlighted (Slack-style: highlight + center, spec 040 §3). */
const LOCATE_HIGHLIGHT_MS = 2000;

export function ChatView() {
  const { t } = useTranslation(["chat", "common"]);
  const copy = useCopyMessage();

  const messages = useChatStore((state) => state.messages);
  const streamingText = useChatStore((state) => state.streamingText);
  const errorText = useChatStore((state) => state.errorText);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const retryRound = useChatStore((state) => state.retryRound);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const draft = useChatStore((state) => state.drafts.get(state.activeConversationId) ?? "");
  const setDraft = useChatStore((state) => state.setDraft);
  const activeKind = useChatStore((state) => state.activeKind);
  const studyMode = useChatStore((state) => state.studyModeFor(state.activeConversationId));
  const setStudyMode = useChatStore((state) => state.setStudyMode);
  const ensureFactchecksLoaded = useFactcheckStore((state) => state.ensureLoaded);
  const entrySessionByMessageId = useFocusSessionsStore((state) => state.entrySessionByMessageId);
  const { containerRef, pinned, handleScroll, scrollToBottom } = useScrollPinning();
  const [locatedMessageId, setLocatedMessageId] = useState<string | null>(null);

  // Fill-on-first-visit: a revisited conversation shows its cached marks instantly.
  useEffect(() => {
    void ensureFactchecksLoaded(activeConversationId);
  }, [activeConversationId, ensureFactchecksLoaded]);

  // Stick to the bottom only while the user is already there — scrolling up to read must
  // never be yanked back down by a streaming delta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages/streamingText are the growth triggers, not read
  useEffect(() => {
    if (pinned) scrollToBottom();
  }, [messages, streamingText, pinned, scrollToBottom]);

  // Station map click -> locate this round (spec 040 §3). A branch click resumes onto that
  // leaf first (making it part of the active path) before scrolling to it.
  useEffect(() => {
    return appEventBus.on("chat:locateMessage", ({ messageId }) => {
      const state = useChatStore.getState();
      if (!state.messages.some((message) => message.id === messageId)) {
        state.resumeFromMessage(messageId);
      }
      setLocatedMessageId(messageId);
    });
  }, []);

  // Runs again once resumeFromMessage's re-render puts the target row in the DOM.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the re-render signal, not read directly
  useEffect(() => {
    if (locatedMessageId === null) return;
    const element = document.querySelector(`[data-message-id="${locatedMessageId}"]`);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(() => setLocatedMessageId(null), LOCATE_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [locatedMessageId, messages]);

  const isStreaming = streamingText !== null;
  // Shape-derived, so the affordance survives a session reload that wiped errorText:
  // an unanswered user leaf is retryable whether or not the failure banner is still around.
  const canRetry =
    !isStreaming && activeConversationId !== null && messages.at(-1)?.role === "user";

  return (
    <div className="flex h-full flex-col bg-stone-50">
      <CompanionChatBanners />
      <FocusSessionsBar />
      <ContinuationBanner />
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full space-y-3 overflow-y-auto p-4"
        >
          {messages.length === 0 && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
              <span className="text-4xl">🍞</span>
              <p>{t("emptyLine")}</p>
            </div>
          )}
          {messages.map((message) => {
            const focusSessionId = entrySessionByMessageId.get(message.id);
            return (
              <div
                key={message.id}
                data-message-id={message.id}
                className={`space-y-1 rounded-2xl transition ${
                  message.id === locatedMessageId ? "ring-2 ring-amber-300" : ""
                }`}
              >
                {focusSessionId !== undefined ? (
                  <FocusEntryCard content={message.content} sessionId={focusSessionId} />
                ) : (
                  <>
                    <MessageBubble
                      conversationId={activeConversationId}
                      author={message.role}
                      content={message.content}
                      messageId={message.id}
                    />
                    {message.role === "assistant" && (
                      <>
                        <FactcheckBadge
                          conversationId={activeConversationId}
                          messageId={message.id}
                        />
                        <FocusSessionBadge messageId={message.id} />
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {isStreaming && (
            <MessageBubble
              conversationId={activeConversationId}
              author="assistant"
              content={streamingText || "…"}
            />
          )}
          {(errorText !== null || canRetry) && (
            <div className="mx-auto max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
              {errorText === null ? t("noReplyYet") : copy(errorText)}
              {canRetry && activeConversationId !== null && (
                <button
                  type="button"
                  onClick={() => void retryRound(activeConversationId)}
                  className="ml-2 rounded-lg bg-amber-100 px-2 py-0.5 text-stone-700 hover:bg-amber-200"
                >
                  {t("common:actions.retry")}
                </button>
              )}
            </div>
          )}
        </div>
        {!pinned && (messages.length > 0 || isStreaming) && (
          <BackToBottomPill onClick={scrollToBottom} />
        )}
      </div>
      <Composer
        conversationId={activeConversationId}
        value={draft}
        streaming={isStreaming}
        disabled={false}
        onChange={(text) => setDraft(activeConversationId, text)}
        onSend={(content) => void sendMessage(content, activeConversationId ?? undefined)}
        onStop={() => stopStreaming(activeConversationId)}
        {...(activeKind === "chat"
          ? {
              studyMode,
              onSetStudyMode: (on: boolean) => void setStudyMode(activeConversationId, on),
            }
          : {})}
      />
    </div>
  );
}

/** Shown while continuing from a mid-tree station (spec 040 §2): the newer branch that used to
 * follow the old leaf isn't gone, just off the active path — "回到最新" jumps back to it. */
function ContinuationBanner() {
  const { t } = useTranslation(["chat", "common"]);
  const allMessages = useChatStore((state) => state.allMessages);
  const currentLeafId = useChatStore((state) => state.currentLeafId);
  const returnToLatest = useChatStore((state) => state.returnToLatest);
  if (currentLeafId === newestLeafId(allMessages)) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-stone-600">
      <span>{t("resumedFromMiddle")}</span>
      <button
        type="button"
        onClick={returnToLatest}
        className="ml-auto rounded px-2 py-0.5 text-stone-400 hover:bg-amber-100"
      >
        {t("backToLatest")}
      </button>
    </div>
  );
}
