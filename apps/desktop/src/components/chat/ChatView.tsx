/**
 * Purpose: center column — message history, streaming reply, gentle error banner, composer.
 * Also renders the mid-tree continuation banner and handles station-map "locate" clicks —
 * scroll-into-view plus a brief highlight, resuming onto the target's branch first when it
 * isn't on the active path (spec 040 §§2-3).
 * Main exports: ChatView.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { useFactcheckStore } from "../../stores/factcheckStore";
import { useFocusSessionsStore } from "../../stores/focusSessionsStore";
import { CompanionChatBanners } from "../companion/CompanionChatBanners";
import { FocusEntryCard } from "../focus/FocusEntryCard";
import { FocusSessionBadge } from "../focus/FocusSessionBadge";
import { FocusSessionsBar } from "../focus/FocusSessionsBar";
import { Composer } from "./Composer";
import { ContinuationBanner } from "./ContinuationBanner";
import { FactcheckBadge } from "./FactcheckBadge";
import { MessageBubble } from "./MessageBubble";
import { MessageList, type MessageListHandle } from "./MessageList";
import { BackToBottomPill } from "./scrollPinning";

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
  const listRef = useRef<MessageListHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [locatedMessageId, setLocatedMessageId] = useState<string | null>(null);

  // Fill-on-first-visit: a revisited conversation shows its cached marks instantly.
  useEffect(() => {
    void ensureFactchecksLoaded(activeConversationId);
  }, [activeConversationId, ensureFactchecksLoaded]);

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

  // Runs again once resumeFromMessage's re-render has the target on the active path. The
  // list scrolls by index rather than by DOM query: with a windowed list the row may not be
  // rendered yet, and querySelector would quietly find nothing.
  useEffect(() => {
    if (locatedMessageId === null) return;
    if (!messages.some((message) => message.id === locatedMessageId)) return;
    listRef.current?.scrollToMessage(locatedMessageId);
    const timer = window.setTimeout(() => setLocatedMessageId(null), LOCATE_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [locatedMessageId, messages]);

  // The composer's height, published to the enclosing <main> as --composer-height so an
  // overlay anchored to its bottom corner (the first-steps checklist) can sit above the input
  // row instead of on the send button where the screen is too small for both.
  useEffect(() => {
    const composer = rootRef.current?.querySelector<HTMLElement>('[data-tour="composer"]');
    const host = rootRef.current?.closest("main");
    if (!composer || !host) return;
    const observer = new ResizeObserver(() =>
      host.style.setProperty("--composer-height", `${composer.offsetHeight}px`),
    );
    observer.observe(composer);
    return () => {
      observer.disconnect();
      host.style.removeProperty("--composer-height");
    };
  }, []);

  const isStreaming = streamingText !== null;
  // Shape-derived, so the affordance survives a session reload that wiped errorText:
  // an unanswered user leaf is retryable whether or not the failure banner is still around.
  const canRetry =
    !isStreaming && activeConversationId !== null && messages.at(-1)?.role === "user";

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-stone-50">
      <CompanionChatBanners />
      <FocusSessionsBar />
      <ContinuationBanner />
      <div className="relative min-h-0 flex-1">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <span className="text-4xl">🍞</span>
            <p>{t("emptyLine")}</p>
          </div>
        ) : (
          <MessageList
            ref={listRef}
            messages={messages}
            onAtBottomChange={setPinned}
            renderMessage={(message) => {
              const focusSessionId = entrySessionByMessageId.get(message.id);
              return (
                <div
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
            }}
            footer={
              <div className="space-y-3">
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
                        className="ms-2 rounded-lg bg-amber-100 px-2 py-0.5 text-stone-700 hover:bg-amber-200"
                      >
                        {t("common:actions.retry")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            }
          />
        )}
        {!pinned && (messages.length > 0 || isStreaming) && (
          <BackToBottomPill onClick={() => listRef.current?.scrollToBottom()} />
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
