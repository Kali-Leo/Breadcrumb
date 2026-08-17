/**
 * Purpose: the message input area — a CONTROLLED textarea + send button (drafts live in
 * chatStore per conversation, so switching views or conversations never loses text); Enter
 * to send, Shift+Enter for newline; while its conversation streams, the send button morphs
 * into a 停止 button. Applies composer:prefill only when addressed to its own conversation.
 * Main exports: Composer.
 */
import { useEffect, useRef } from "react";
import { appEventBus } from "../stores/chatStore";

/** 学习模式 switch copy (spec 052, redesigned per Leo 2026-08-17: a pill segmented switch
 * above the input box, both states named — the same form as the map's 休闲|目标 pill and
 * ChatGPT's composer mode chips). Hover hints are full sentences for first-time visitors. */
const STUDY_MODE_COPY = {
  freeLabel: "自由对话",
  freeHint: "自由聊天，任何话题、任何形式都可以。",
  studyLabel: "学习模式",
  studyHint: "回复会引导你思考和练习，帮你把学到的记牢。",
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
   * hides the switch (companion/teach popups). */
  studyMode?: boolean;
  onSetStudyMode?: (on: boolean) => void;
}

export function Composer(props: ComposerProps) {
  const { conversationId, value, streaming, disabled, onChange, onSend, onStop } = props;
  const { studyMode, onSetStudyMode } = props;
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
    <div className="border-t border-stone-200 bg-white">
      {onSetStudyMode !== undefined && (
        <div className="px-3 pt-2">
          <div className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs shadow-sm">
            {(
              [
                [false, STUDY_MODE_COPY.freeLabel, STUDY_MODE_COPY.freeHint],
                [true, STUDY_MODE_COPY.studyLabel, STUDY_MODE_COPY.studyHint],
              ] as const
            ).map(([on, label, title]) => (
              <button
                key={label}
                type="button"
                aria-pressed={studyMode === on}
                onClick={() => onSetStudyMode(on)}
                title={title}
                className={`px-3 py-1 transition-colors ${
                  studyMode === on ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
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
    </div>
  );
}
