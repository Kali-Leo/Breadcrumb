/**
 * Purpose: the assistant-message selection quote bar (spec 039 §2.3) — selecting text inside
 * the wrapped bubble floats "解释一下 / 展开聊聊", both of which quote the selection into the
 * composer's prefill without sending. Zero new LLM call, zero new purpose.
 * Main exports: SelectionQuoteBar.
 */
import {
  EXPLORE_UI_COPY,
  selectionDiscussPrefill,
  selectionExplainPrefill,
} from "@breadcrumb/plugin-explore";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { appEventBus } from "../stores/chatStore";

/** Selections longer than this are truncated (with an ellipsis) before being quoted. */
const MAX_QUOTE_LENGTH = 120;

function truncateSelection(text: string): string {
  return text.length > MAX_QUOTE_LENGTH ? `${text.slice(0, MAX_QUOTE_LENGTH)}…` : text;
}

interface FloatingBar {
  quotedText: string;
  left: number;
  top: number;
}

export function SelectionQuoteBar({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<FloatingBar | null>(null);

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
        setBar(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setBar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setBar({ quotedText: truncateSelection(text), left: rect.left, top: rect.top - 40 });
    }
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setBar(null);
    }
    document.addEventListener("mouseup", handleSelectionEnd);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mouseup", handleSelectionEnd);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const dismiss = () => {
    setBar(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div ref={containerRef} className="relative">
      {children}
      {bar !== null && (
        <div
          style={{ position: "fixed", left: bar.left, top: bar.top }}
          className="z-20 flex gap-1 rounded-lg border border-stone-200 bg-white px-1.5 py-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              appEventBus.emit("composer:prefill", {
                text: selectionExplainPrefill(bar.quotedText),
              });
              dismiss();
            }}
            className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
          >
            {EXPLORE_UI_COPY.selectionExplainButton}
          </button>
          <button
            type="button"
            onClick={() => {
              appEventBus.emit("composer:prefill", {
                text: selectionDiscussPrefill(bar.quotedText),
              });
              dismiss();
            }}
            className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
          >
            {EXPLORE_UI_COPY.selectionDiscussButton}
          </button>
        </div>
      )}
    </div>
  );
}
