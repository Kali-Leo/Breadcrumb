/**
 * Purpose: renders one chat message (user right-aligned amber, assistant left-aligned neutral).
 * Main exports: MessageBubble.
 */

interface MessageBubbleProps {
  author: "user" | "assistant" | "system";
  content: string;
}

export function MessageBubble({ author, content }: MessageBubbleProps) {
  const isUser = author === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser ? "bg-amber-100 text-stone-800" : "bg-white text-stone-800 shadow-sm"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
