/**
 * Purpose: renders one chat message (user right-aligned amber, assistant left-aligned
 * neutral); assistant messages may be diglot-woven at display time (spec 033) — storage
 * and LLM context always keep the original text.
 * Main exports: MessageBubble.
 */
import { useEffect } from "react";
import { useDiglotStore } from "../stores/diglotStore";
import { DiglotText } from "./DiglotText";

interface MessageBubbleProps {
  author: "user" | "assistant" | "system";
  content: string;
  /** Present for persisted messages; streaming previews have none and are never woven. */
  messageId?: string;
}

export function MessageBubble({ author, content, messageId }: MessageBubbleProps) {
  const isUser = author === "user";
  const diglotEnabled = useDiglotStore((state) => state.settings.enabled);
  const patches = useDiglotStore((state) =>
    messageId === undefined ? undefined : state.patchesByMessage.get(messageId),
  );

  const shouldWeave = diglotEnabled && author === "assistant" && messageId !== undefined;
  useEffect(() => {
    if (shouldWeave && messageId !== undefined) {
      void useDiglotStore.getState().ensureWoven(messageId, content);
    }
  }, [shouldWeave, messageId, content]);

  const woven = shouldWeave && messageId !== undefined && patches !== undefined;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser ? "bg-amber-100 text-stone-800" : "bg-white text-stone-800 shadow-sm"
        }`}
      >
        {woven && patches.length > 0 ? (
          <DiglotText messageId={messageId} content={content} patches={patches} />
        ) : (
          content
        )}
      </div>
    </div>
  );
}
