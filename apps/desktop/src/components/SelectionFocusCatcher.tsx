/**
 * Purpose: the assistant-message selection-to-focus catcher (spec 042 §5) — selecting text
 * inside the wrapped bubble floats a "press Enter" hint; Enter opens a focus session rooted at
 * the (truncated) selection, with the caller supplying the full reply as parent context. Esc,
 * or a pointer press outside the current selection, dismisses the hint without side effects.
 * Main exports: SelectionFocusCatcher.
 */
import { focusSelectHint } from "@breadcrumb/plugin-explore";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Selections longer than this are truncated before becoming a focus session's root label
 * (spec 042 §5: "选区文本截 24 字"). */
const MAX_ROOT_LABEL_CHARS = 24;

function truncateSelection(text: string): string {
  return text.length > MAX_ROOT_LABEL_CHARS ? `${text.slice(0, MAX_ROOT_LABEL_CHARS)}…` : text;
}

interface SelectionHint {
  quotedText: string;
  left: number;
  top: number;
}

export function SelectionFocusCatcher({
  children,
  onConfirm,
}: {
  children: ReactNode;
  /** Called with the truncated selection text on Enter. */
  onConfirm: (rootLabel: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<SelectionHint | null>(null);
  // Ref, not a deps entry: onConfirm is a fresh closure every render, and this effect should
  // register its document listeners once, not on every parent re-render.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    function handleSelectionEnd() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const container = containerRef.current;
      if (
        text.length === 0 ||
        selection === null ||
        selection.rangeCount === 0 ||
        container === null
      ) {
        setHint(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setHint(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setHint({ quotedText: truncateSelection(text), left: rect.left, top: rect.top - 32 });
    }
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setHint(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      setHint((current) => {
        if (current === null) return current;
        if (event.key === "Enter") {
          onConfirmRef.current(current.quotedText);
          window.getSelection()?.removeAllRanges();
          return null;
        }
        if (event.key === "Escape") return null;
        return current;
      });
    }
    document.addEventListener("mouseup", handleSelectionEnd);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleSelectionEnd);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {children}
      {hint !== null && (
        <div
          style={{ position: "fixed", left: hint.left, top: hint.top }}
          className="z-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 shadow-lg"
        >
          {focusSelectHint(hint.quotedText)}
        </div>
      )}
    </div>
  );
}
