/**
 * Purpose: center column — message history, streaming reply, gentle error banner, composer.
 * Also renders the mid-tree continuation banner and handles station-map "locate" clicks —
 * scroll-into-view plus a brief highlight, resuming onto the target's branch first when it
 * isn't on the active path (spec 040 §§2-3).
 * Main exports: ChatView.
 */
import { useEffect, useRef, useState } from "react";
import { newestLeafId } from "../lib/messageTree";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useDoorStore } from "../stores/doorStore";
import { useFactcheckStore } from "../stores/factcheckStore";
import { useFocusSessionsStore } from "../stores/focusSessionsStore";
import { CompanionChatBanners } from "./CompanionChatBanners";
import { CompanionProposalBubble } from "./CompanionProposalBubble";
import { Composer } from "./Composer";
import { FactcheckBadge } from "./FactcheckBadge";
import { FocusEntryCard } from "./FocusEntryCard";
import { FocusSessionBadge } from "./FocusSessionBadge";
import { FocusSessionsBar } from "./FocusSessionsBar";
import { MessageBubble } from "./MessageBubble";

/** How long a located message stays highlighted (Slack-style: highlight + center, spec 040 §3). */
const LOCATE_HIGHLIGHT_MS = 2000;

export function ChatView() {
  const messages = useChatStore((state) => state.messages);
  const streamingText = useChatStore((state) => state.streamingText);
  const errorText = useChatStore((state) => state.errorText);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loadFactchecks = useFactcheckStore((state) => state.loadForConversation);
  const entrySessionByMessageId = useFocusSessionsStore((state) => state.entrySessionByMessageId);
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const [locatedMessageId, setLocatedMessageId] = useState<string | null>(null);

  useEffect(() => {
    void loadFactchecks(activeConversationId);
  }, [activeConversationId, loadFactchecks]);

  // Explore doors are session-scoped (spec 039 §2.2): a fresh conversation starts with no
  // opened doors, no reveal cooldowns, no guess history.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on the conversation switch, not on resetForConversation's identity
  useEffect(() => {
    useDoorStore.getState().resetForConversation();
  }, [activeConversationId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever a message or stream delta arrives
  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

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

  return (
    <div className="flex h-full flex-col bg-stone-50">
      <CompanionChatBanners />
      <FocusSessionsBar />
      <ContinuationBanner />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <span className="text-4xl">🍞</span>
            <p>每一次对话，都会留下一枚面包屑。</p>
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
                    author={message.role}
                    content={message.content}
                    messageId={message.id}
                  />
                  {message.role === "assistant" && (
                    <>
                      <FactcheckBadge messageId={message.id} />
                      <FocusSessionBadge messageId={message.id} />
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
        <CompanionProposalBubble />
        {isStreaming && <MessageBubble author="assistant" content={streamingText || "…"} />}
        {errorText && (
          <div className="mx-auto max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
            {errorText}
          </div>
        )}
        <div ref={scrollAnchor} />
      </div>
      <Composer disabled={isStreaming} onSend={(content) => void sendMessage(content)} />
    </div>
  );
}

/** Shown while continuing from a mid-tree station (spec 040 §2): the newer branch that used to
 * follow the old leaf isn't gone, just off the active path — "回到最新" jumps back to it. */
function ContinuationBanner() {
  const allMessages = useChatStore((state) => state.allMessages);
  const currentLeafId = useChatStore((state) => state.currentLeafId);
  const returnToLatest = useChatStore((state) => state.returnToLatest);
  if (currentLeafId === newestLeafId(allMessages)) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-stone-600">
      <span>正在从中途的一站继续 · 原来的后续仍然保留</span>
      <button
        type="button"
        onClick={returnToLatest}
        className="ml-auto rounded px-2 py-0.5 text-stone-400 hover:bg-amber-100"
      >
        回到最新
      </button>
    </div>
  );
}
