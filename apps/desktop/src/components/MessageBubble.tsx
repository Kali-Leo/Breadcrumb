/**
 * Purpose: renders one chat message (user right-aligned amber, assistant left-aligned
 * neutral). Assistant messages render as markdown with KaTeX math; the diglot weave
 * (spec 033) applies to the same normalized display source, so patch offsets always
 * match the screen. Storage and LLM context keep the original text untouched.
 * Main exports: MessageBubble.
 */
import { useEffect, useMemo } from "react";
import { normalizeMathDelimiters } from "../lib/markdownMath";
import { useDiglotStore } from "../stores/diglotStore";
import { MarkdownContent } from "./MarkdownContent";

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

  // The display source: math delimiters normalized for remark-math. Weaving runs on the
  // same string so diglot patch offsets and markdown node offsets agree.
  const displaySource = useMemo(
    () => (isUser ? content : normalizeMathDelimiters(content)),
    [isUser, content],
  );

  const shouldWeave = diglotEnabled && author === "assistant" && messageId !== undefined;
  useEffect(() => {
    if (shouldWeave && messageId !== undefined) {
      void useDiglotStore.getState().ensureWoven(messageId, displaySource);
    }
  }, [shouldWeave, messageId, displaySource]);

  const woven =
    shouldWeave && messageId !== undefined && patches !== undefined && patches.length > 0;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap bg-amber-100 text-stone-800"
            : "bg-white text-stone-800 shadow-sm"
        }`}
      >
        {isUser ? (
          content
        ) : (
          <MarkdownContent
            source={displaySource}
            diglot={
              woven && messageId !== undefined ? { messageId, patches: patches ?? [] } : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
