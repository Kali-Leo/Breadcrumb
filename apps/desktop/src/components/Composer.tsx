/**
 * Purpose: the message input area — textarea + send button, Enter to send,
 * Shift+Enter for newline; disabled while a reply is streaming.
 * Main exports: Composer.
 */
import { useState } from "react";

interface ComposerProps {
  disabled: boolean;
  onSend(content: string): void;
}

export function Composer({ disabled, onSend }: ComposerProps) {
  const [draft, setDraft] = useState("");

  function submit() {
    const content = draft.trim();
    if (content === "" || disabled) return;
    setDraft("");
    onSend(content);
  }

  return (
    <div className="flex items-end gap-2 border-t border-stone-200 bg-white p-3">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="想学点什么？说说看…（Enter 发送，Shift+Enter 换行）"
        className="flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || draft.trim() === ""}
        className="rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        发送
      </button>
    </div>
  );
}
