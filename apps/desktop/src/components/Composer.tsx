/**
 * Purpose: the message input area — a CONTROLLED textarea + send button (drafts live in
 * chatStore per conversation, so switching views or conversations never loses text); Enter
 * to send, Shift+Enter for newline; while its conversation streams, the send button morphs
 * into a 停止 button. Applies composer:prefill only when addressed to its own conversation.
 * Main exports: Composer.
 */
import { useEffect, useRef } from "react";
import { appEventBus } from "../stores/chatStore";

/** 学习模式 toggle copy (spec 052) — hover hints are full sentences so a first-time visitor
 * learns both states without any other introduction. */
const STUDY_MODE_COPY = {
  label: "学习模式",
  onHint: "学习模式已开启：回复会引导你思考和练习。点击关闭，改为自由聊天。",
  offHint: "现在是自由聊天，聊什么都可以。点击开启学习模式，回复会更注重引导和巩固。",
} as const;

interface ComposerProps {
  /** The conversation this composer is bound to; null = the new-conversation composer.
   * Stop/prefill/draft all key off this binding, never off "whatever is active". */
  conversationId: string | null;
  value: string;
  /** True while THIS conversation's reply streams — typing stays possible, sending waits. */
  streaming: boolean;
  disabled: boolean;
  onChange(text: string): void;
  onSend(content: string): void;
  onStop(): void;
  /** 学习模式 (spec 052): present only on plain-chat composers — leaving both undefined
   * hides the toggle (companion/teach popups). */
  studyMode?: boolean;
  onToggleStudyMode?: () => void;
}

export function Composer(props: ComposerProps) {
  const { conversationId, value, streaming, disabled, onChange, onSend, onStop } = props;
  const { studyMode, onToggleStudyMode } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(
    () =>
      appEventBus.on("composer:prefill", (payload) => {
        if (payload.conversationId !== conversationId) return;
        onChangeRef.current(payload.text);
        textareaRef.current?.focus();
      }),
    [conversationId],
  );

  function submit() {
    const content = value.trim();
    if (content === "" || disabled || streaming) return;
    // The draft is NOT cleared here — the store clears it once the message persisted, so a
    // failed send keeps the text.
    onSend(content);
  }

  return (
    <div className="flex items-end gap-2 border-t border-stone-200 bg-white p-3">
      {onToggleStudyMode !== undefined && (
        <button
          type="button"
          onClick={onToggleStudyMode}
          title={studyMode ? STUDY_MODE_COPY.onHint : STUDY_MODE_COPY.offHint}
          className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm transition-colors ${
            studyMode
              ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
              : "border-stone-300 text-stone-500 hover:bg-stone-50"
          }`}
        >
          {STUDY_MODE_COPY.label}
        </button>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        disabled={disabled}
        placeholder="想学点什么？说说看…（Enter 发送，Shift+Enter 换行）"
        className="flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400 disabled:bg-stone-50"
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-xl border border-stone-300 px-4 py-2 text-stone-600 transition-colors hover:bg-stone-100"
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim() === ""}
          className="rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          发送
        </button>
      )}
    </div>
  );
}
