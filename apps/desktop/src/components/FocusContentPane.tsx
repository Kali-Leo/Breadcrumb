/**
 * Purpose: the focus overlay's main pane (spec 042 §3) — the current station's answer with
 * door-word marks, select-by-selection ("按 Enter 解释"), the guess-gate card, streaming/error
 * states, and the bottom ask bar. Selection handling lives here because it's scoped to this
 * pane's own text, not the whole overlay.
 * Main exports: FocusContentPane.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { focusSelectHint } from "@breadcrumb/plugin-explore";
import { useEffect, useRef, useState } from "react";
import { computeFocusDoorPatches } from "../lib/focusDoors";
import { useFocusStore } from "../stores/focusStore";
import { FocusAskBar } from "./FocusAskBar";
import { FocusGuessCard } from "./FocusGuessCard";
import { MarkdownContent } from "./MarkdownContent";

const SELECTION_HINT_MAX_CHARS = 40;

interface SelectionHint {
  text: string;
  left: number;
  top: number;
}

export function FocusContentPane({ currentNode }: { currentNode: FocusNodeRow | null }) {
  const streamingText = useFocusStore((state) => state.streamingText);
  const errorText = useFocusStore((state) => state.errorText);
  const pendingGuess = useFocusStore((state) => state.pendingGuess);
  const openedDoorNodeIds = useFocusStore((state) => state.openedDoorNodeIds);
  const selectWord = useFocusStore((state) => state.selectWord);
  const submitGuess = useFocusStore((state) => state.submitGuess);
  const skipGuess = useFocusStore((state) => state.skipGuess);
  const askQuestion = useFocusStore((state) => state.askQuestion);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<SelectionHint | null>(null);
  // Mirrors hint so the keydown handler acts OUTSIDE a state updater — side effects inside
  // updaters get double-invoked by React's dev purity check (one Enter made two stations).
  const hintRef = useRef<SelectionHint | null>(null);
  hintRef.current = hint;
  const [doors, setDoors] = useState<DoorCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (currentNode === null || currentNode.answer_text.length === 0) {
      setDoors([]);
      return;
    }
    void computeFocusDoorPatches(currentNode.answer_text, openedDoorNodeIds).then((result) => {
      if (!cancelled) setDoors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currentNode, openedDoorNodeIds]);

  useEffect(() => {
    function onMouseUp() {
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
      setHint({ text, left: rect.left, top: rect.top - 32 });
    }
    function onKeyDown(event: KeyboardEvent) {
      const current = hintRef.current;
      if (current === null) return;
      if (event.key === "Enter") {
        void selectWord(current.text);
        window.getSelection()?.removeAllRanges();
        setHint(null);
      } else if (event.key === "Escape") {
        setHint(null);
      }
    }
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectWord]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4">
        {pendingGuess !== null && (
          <FocusGuessCard word={pendingGuess.word} onSubmit={submitGuess} onSkip={skipGuess} />
        )}
        {currentNode !== null && currentNode.answer_text.length > 0 && (
          <MarkdownContent
            source={currentNode.answer_text}
            doors={{ patches: doors, onSelect: (word) => void selectWord(word) }}
          />
        )}
        {streamingText !== null && (
          <MarkdownContent source={streamingText.length > 0 ? streamingText : "…"} />
        )}
        {errorText !== null && (
          <div className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
            {errorText}
          </div>
        )}
      </div>
      {hint !== null && (
        <div
          style={{ position: "fixed", left: hint.left, top: hint.top }}
          className="z-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 shadow-lg"
        >
          {focusSelectHint(
            hint.text.length > SELECTION_HINT_MAX_CHARS
              ? `${hint.text.slice(0, SELECTION_HINT_MAX_CHARS)}…`
              : hint.text,
          )}
        </div>
      )}
      <FocusAskBar onAsk={(question) => void askQuestion(question)} />
    </div>
  );
}
