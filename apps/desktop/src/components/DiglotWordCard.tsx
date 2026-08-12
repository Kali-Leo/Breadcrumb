/**
 * Purpose: the hover card of a woven word (spec 033) — guess-first when the policy asks
 * (no skip path, Leo 2026-08-12), otherwise the gloss: original word, reading, audio.
 * Main exports: DiglotWordCard.
 */
import type { PackEntry, ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import { useEffect, useRef, useState } from "react";
import { speakWord } from "../lib/diglotAudio";
import { feedbackTextFor, submitDiglotGuess } from "../lib/diglotGuess";
import { useDiglotStore } from "../stores/diglotStore";

interface DiglotWordCardProps {
  patch: ReplacementPatch;
  entry: PackEntry | null;
  /** The full sentence the word appeared in (guess cards always show context). */
  context: string;
  messageId: string;
  /** Whether this card opened in guess mode (decided once at open by the policy). */
  guessFirst: boolean;
  /** Tells the parent the guess was submitted — closing before this counts as abandoned. */
  onGuessResolved: () => void;
}

export function DiglotWordCard({
  patch,
  entry,
  context,
  messageId,
  guessFirst,
  onGuessResolved,
}: DiglotWordCardProps) {
  const [guessDone, setGuessDone] = useState(!guessFirst);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [guessText, setGuessText] = useState("");
  const openedAt = useRef(Date.now());
  const loaded = useDiglotStore((state) => state.loaded);
  const settings = useDiglotStore((state) => state.settings);
  const recordSignal = useDiglotStore((state) => state.recordSignal);
  const noteGlossSeen = useDiglotStore((state) => state.noteGlossSeen);
  const noteGuessOutcome = useDiglotStore((state) => state.noteGuessOutcome);

  // The gloss reveal is itself the "hover" lookup signal — but only after any guess gate.
  useEffect(() => {
    if (!guessDone) return;
    noteGlossSeen(patch.lemma);
    if (!guessFirst) {
      void recordSignal(patch.lemma, "hover", messageId, context, null);
    }
  }, [guessDone, guessFirst, patch.lemma, messageId, context, recordSignal, noteGlossSeen]);

  const submit = async () => {
    if (loaded === null || guessText.trim().length === 0) return;
    const latencyMs = Date.now() - openedAt.current;
    const { grade, eventKind } = await submitDiglotGuess({
      loaded,
      lemma: patch.lemma,
      originalSurface: patch.original,
      guess: guessText,
      context,
      latencyMs,
    });
    noteGuessOutcome(false);
    onGuessResolved();
    void recordSignal(patch.lemma, eventKind, messageId, context, latencyMs);
    setFeedback(feedbackTextFor(grade, patch.original));
    setGuessDone(true);
  };

  if (entry === null) return null;

  if (!guessDone) {
    return (
      <div className="w-64 space-y-2 p-3 text-sm text-stone-700">
        <p className="text-xs text-stone-400">这个词是什么意思?先猜一次,再看释义。</p>
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
            placeholder="你的猜测"
          />
          <button
            type="submit"
            disabled={guessText.trim().length === 0}
            className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 disabled:opacity-40"
          >
            提交
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-64 space-y-1.5 p-3 text-sm text-stone-700">
      {feedback !== null && <p className="text-stone-600">{feedback}</p>}
      <div className="flex items-baseline gap-2">
        <span className="text-base font-medium">{patch.replacement}</span>
        {entry.reading !== "" && <span className="text-xs text-stone-400">{entry.reading}</span>}
        <span className="text-xs text-stone-400">{entry.pos}</span>
        {settings.ttsEnabled && (
          <button
            type="button"
            className="ml-auto rounded px-1 text-base hover:bg-stone-100"
            onClick={() => {
              void recordSignal(patch.lemma, "audio", messageId, context, null);
              void speakWord(
                patch.replacement,
                loaded?.pack.targetLang ?? "en",
                settings.piperPath,
                settings.piperModelPath,
              );
            }}
          >
            🔊
          </button>
        )}
      </div>
      <p>
        {patch.original}
        {entry.altTargets.length > 0 && (
          <span className="text-xs text-stone-400"> · 也作 {entry.altTargets.join(", ")}</span>
        )}
      </p>
    </div>
  );
}
