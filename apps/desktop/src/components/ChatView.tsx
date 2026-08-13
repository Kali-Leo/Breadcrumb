/**
 * Purpose: center column — message history, streaming reply, gentle error banner, composer.
 * Main exports: ChatView.
 */
import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import { useFactcheckStore } from "../stores/factcheckStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { CompanionChatBanners } from "./CompanionChatBanners";
import { Composer } from "./Composer";
import { FactcheckBadge } from "./FactcheckBadge";
import { MessageBubble } from "./MessageBubble";

export function ChatView() {
  const messages = useChatStore((state) => state.messages);
  const streamingText = useChatStore((state) => state.streamingText);
  const errorText = useChatStore((state) => state.errorText);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loadFactchecks = useFactcheckStore((state) => state.loadForConversation);
  const scrollAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadFactchecks(activeConversationId);
  }, [activeConversationId, loadFactchecks]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever a message or stream delta arrives
  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const isStreaming = streamingText !== null;

  return (
    <div className="flex h-full flex-col bg-stone-50">
      <CompanionChatBanners />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <span className="text-4xl">🍞</span>
            <p>每一次对话，都会留下一枚面包屑。</p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            <MessageBubble author={message.role} content={message.content} messageId={message.id} />
            {message.role === "assistant" && <FactcheckBadge messageId={message.id} />}
          </div>
        ))}
        {isStreaming && <MessageBubble author="assistant" content={streamingText || "…"} />}
        {errorText && (
          <div className="mx-auto max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
            {errorText}
          </div>
        )}
        <div ref={scrollAnchor} />
      </div>
      <AnchorBanner />
      <Composer disabled={isStreaming} onSend={(content) => void sendMessage(content)} />
    </div>
  );
}

/** Shows which knowledge node is anchored; one click releases it. */
function AnchorBanner() {
  const nodes = useKnowledgeStore((state) => state.nodes);
  const anchoredNodeId = useKnowledgeStore((state) => state.anchoredNodeId);
  const toggleAnchor = useKnowledgeStore((state) => state.toggleAnchor);
  const anchoredNode = nodes.find((node) => node.id === anchoredNodeId);
  if (!anchoredNode) return null;
  return (
    <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-stone-600">
      <span>📍 正在围绕「{anchoredNode.label}」讨论</span>
      <button
        type="button"
        onClick={() => toggleAnchor(anchoredNode.id)}
        className="ml-auto rounded px-2 py-0.5 text-stone-400 hover:bg-amber-100"
      >
        取消锚定
      </button>
    </div>
  );
}
