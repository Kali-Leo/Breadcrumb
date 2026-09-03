/**
 * Purpose: the assistant-message selection-to-focus catcher (spec 042 §5) — selecting text
 * inside the wrapped bubble offers to open a focus session rooted at the (truncated)
 * selection, with the caller supplying the full reply as parent context. The offer itself —
 * a hint line under a mouse, a button under a finger — and the events that raise it live in
 * SelectionFocusPrompt and lib/focus/selectionFocus, shared with the focus overlay's own pane.
 * Main exports: SelectionFocusCatcher.
 */
import { focusSelectHintMessage } from "@breadcrumb/feature-explore";
import type { ReactNode } from "react";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { useSelectionFocus } from "../../lib/focus/selectionFocus";
import { truncate } from "../../lib/platform/truncateText";
import { SelectionFocusPrompt } from "./SelectionFocusPrompt";

/** Selections longer than this are truncated before becoming a focus session's root label
 * (spec 042 §5: "选区文本截 24 字"). */
const MAX_ROOT_LABEL_CHARS = 24;

export function SelectionFocusCatcher({
  children,
  onConfirm,
}: {
  children: ReactNode;
  /** Called with the truncated selection text. */
  onConfirm: (rootLabel: string) => void;
}) {
  const copy = useCopyMessage();
  const { containerRef, selection, confirm } = useSelectionFocus<HTMLDivElement>({
    onConfirm: (text) => onConfirm(truncate(text, MAX_ROOT_LABEL_CHARS)),
  });

  return (
    <div ref={containerRef} className="relative">
      {children}
      <SelectionFocusPrompt
        selection={selection}
        onConfirm={confirm}
        hint={
          selection === null
            ? null
            : copy(focusSelectHintMessage(truncate(selection.text, MAX_ROOT_LABEL_CHARS)))
        }
      />
    </div>
  );
}
