/**
 * Purpose: the focus overlay's main pane (spec 042 §3) — the current station's answer with
 * door-word marks, select-a-phrase-to-explain, the guess-gate card, streaming/error states,
 * and the bottom ask bar. The selection offer is scoped to this pane's own text, not the whole
 * overlay, but the rule behind it is the shared one in lib/focus/selectionFocus.
 * Main exports: FocusContentPane.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import type { DoorCandidate } from "@breadcrumb/feature-explore";
import { focusSelectHintMessage } from "@breadcrumb/feature-explore";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { normalizeMathDelimiters } from "../../lib/chat/markdownMath";
import { computeFocusDoorPatches } from "../../lib/focus/focusDoors";
import { useSelectionFocus } from "../../lib/focus/selectionFocus";
import { useFocusStore } from "../../stores/focusStore";
import { MarkdownContent } from "../chat/MarkdownContent";
import { FocusAskBar } from "./FocusAskBar";
import { FocusGuessCard } from "./FocusGuessCard";
import { SelectionFocusPrompt } from "./SelectionFocusPrompt";

const SELECTION_HINT_MAX_CHARS = 40;

export function FocusContentPane({ currentNode }: { currentNode: FocusNodeRow | null }) {
  const copy = useCopyMessage();
  const { t } = useTranslation(["learning", "common"]);
  const streamingText = useFocusStore((state) => state.streamingText);
  const errorText = useFocusStore((state) => state.errorText);
  const pendingGuess = useFocusStore((state) => state.pendingGuess);
  const openedDoorNodeIds = useFocusStore((state) => state.openedDoorNodeIds);
  const conversationId = useFocusStore((state) => state.conversationId);
  const selectWord = useFocusStore((state) => state.selectWord);
  const submitGuess = useFocusStore((state) => state.submitGuess);
  const skipGuess = useFocusStore((state) => state.skipGuess);
  const askQuestion = useFocusStore((state) => state.askQuestion);

  // Escape is claimed: it dismisses the offer only, and the overlay's own handler checks
  // defaultPrevented and stays open.
  const { containerRef, selection, confirm } = useSelectionFocus<HTMLDivElement>({
    onConfirm: (text) => void selectWord(text),
    claimEscape: true,
  });
  const [doors, setDoors] = useState<DoorCandidate[]>([]);

  // The canonical display source, same as MessageBubble: \[..\]/\(..\) become the dollar
  // delimiters remark-math parses, so formulas render instead of showing as raw LaTeX.
  // Door patches are computed on THIS string — their offsets must match what is on screen.
  const displaySource = useMemo(
    () => (currentNode === null ? "" : normalizeMathDelimiters(currentNode.answer_text)),
    [currentNode],
  );

  useEffect(() => {
    let cancelled = false;
    if (currentNode === null || displaySource.length === 0 || conversationId === null) {
      setDoors([]);
      return;
    }
    void computeFocusDoorPatches(
      displaySource,
      openedDoorNodeIds,
      currentNode.id,
      conversationId,
    ).then((result) => {
      if (!cancelled) setDoors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currentNode, displaySource, openedDoorNodeIds, conversationId]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4">
        {pendingGuess !== null && (
          <FocusGuessCard word={pendingGuess.word} onSubmit={submitGuess} onSkip={skipGuess} />
        )}
        {currentNode !== null && displaySource.length > 0 && (
          <MarkdownContent
            source={displaySource}
            doors={{ patches: doors, onSelect: (word) => void selectWord(word) }}
          />
        )}
        {streamingText !== null && (
          <MarkdownContent
            source={streamingText.length > 0 ? normalizeMathDelimiters(streamingText) : "…"}
          />
        )}
        {errorText !== null && (
          <div className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
            {copy(errorText)}
            <button
              type="button"
              onClick={() => void useFocusStore.getState().retryCurrent()}
              className="ms-2 rounded-lg bg-amber-100 px-2 py-0.5 text-stone-700 coarse:inline-flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center coarse:px-4 hover:bg-amber-200"
            >
              {t("learning:focus.retryButton")}
            </button>
          </div>
        )}
      </div>
      <SelectionFocusPrompt
        selection={selection}
        onConfirm={confirm}
        hint={
          selection === null
            ? null
            : copy(
                focusSelectHintMessage(
                  selection.text.length > SELECTION_HINT_MAX_CHARS
                    ? `${selection.text.slice(0, SELECTION_HINT_MAX_CHARS)}…`
                    : selection.text,
                ),
              )
        }
      />
      <FocusAskBar onAsk={(question) => void askQuestion(question)} />
    </div>
  );
}
