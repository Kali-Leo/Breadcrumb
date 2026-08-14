/**
 * Purpose: the popover of an explore door (spec 039 §2.2) — guess-first when the gate policy
 * asks (a real context sentence, then feedback), otherwise the node summary directly; either
 * way ends with "展开聊聊" which anchors the node and prefills the composer.
 * Main exports: ConceptDoorCard.
 */
import { doorExpandPrefill, EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { useEffect, useRef, useState } from "react";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useDoorStore } from "../stores/doorStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";

interface ConceptDoorCardProps {
  nodeId: string;
  messageId: string;
  /** The sentence the door word appeared in — guess cards always show real context. */
  context: string;
  /** Whether this card opened in guess mode (decided once at open by the gate policy). */
  guessFirst: boolean;
  /** Tells the parent the guess was submitted — closing before this counts as abandoned. */
  onGuessResolved: () => void;
  /** Closes the popover (used by "展开聊聊", which resolves the card either way). */
  onClose: () => void;
}

export function ConceptDoorCard({
  nodeId,
  messageId,
  context,
  guessFirst,
  onGuessResolved,
  onClose,
}: ConceptDoorCardProps) {
  const node = useKnowledgeStore((state) =>
    state.nodes.find((candidate) => candidate.id === nodeId),
  );
  const anchoredNodeId = useKnowledgeStore((state) => state.anchoredNodeId);
  const toggleAnchor = useKnowledgeStore((state) => state.toggleAnchor);
  const conversationId = useChatStore((state) => state.activeConversationId);
  const submitConceptGuess = useDoorStore((state) => state.submitConceptGuess);
  const noteReveal = useDoorStore((state) => state.noteReveal);
  const markOpened = useDoorStore((state) => state.markOpened);
  const [guessDone, setGuessDone] = useState(!guessFirst);
  const [guessText, setGuessText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const revealSignaled = useRef(false);

  // The reveal (direct or post-guess) is the moment this door counts as "opened" and its
  // node's gate cools down — not the mere hover/click that opened the popover.
  useEffect(() => {
    if (!guessDone || revealSignaled.current) return;
    revealSignaled.current = true;
    noteReveal(nodeId);
    markOpened(nodeId);
  }, [guessDone, nodeId, noteReveal, markOpened]);

  if (node === undefined) return null;

  const submit = async () => {
    if (conversationId === null || guessText.trim().length === 0) return;
    const result = await submitConceptGuess(nodeId, guessText, conversationId, messageId);
    onGuessResolved();
    setFeedback(result.feedback);
    setGuessDone(true);
  };

  const expand = () => {
    if (anchoredNodeId !== nodeId) toggleAnchor(nodeId);
    appEventBus.emit("composer:prefill", { text: doorExpandPrefill(node.label) });
    onClose();
  };

  if (!guessDone) {
    return (
      <div className="w-64 space-y-2 p-3 text-sm text-stone-700">
        <p className="text-xs text-stone-400">{EXPLORE_UI_COPY.doorGuessPrompt}</p>
        <p className="rounded bg-stone-50 px-2 py-1 text-xs leading-relaxed">{context}</p>
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: the card exists to receive this input
            autoFocus
            value={guessText}
            onChange={(event) => setGuessText(event.target.value)}
            className="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1 text-sm"
            placeholder={EXPLORE_UI_COPY.doorGuessPlaceholder}
          />
          <button
            type="submit"
            disabled={guessText.trim().length === 0}
            className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 disabled:opacity-40"
          >
            {EXPLORE_UI_COPY.doorGuessSubmit}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-64 space-y-1.5 p-3 text-sm text-stone-700">
      <p>{feedback ?? node.summary}</p>
      <button
        type="button"
        onClick={expand}
        className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 hover:bg-amber-200"
      >
        {EXPLORE_UI_COPY.doorExpandButton}
      </button>
    </div>
  );
}
