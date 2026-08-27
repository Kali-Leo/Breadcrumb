/**
 * Purpose: the hover card of a woven word (spec 033) — guess-first when the policy asks
 * (no skip path, Leo 2026-08-12), otherwise the gloss: original word, reading, audio. The
 * 🔊 renders only for a VERIFIED audio provider (canSpeak); IPA shows regardless.
 * Main exports: DiglotWordCard.
 */

import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { PackEntry, ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../i18n/useCopyMessage";
import { canSpeak, speakWord, subscribeVoicesChanged } from "../lib/diglotAudio";
import { guessFeedbackMessage, submitDiglotGuess } from "../lib/diglotGuess";
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
  const { t } = useTranslation(["learning", "common"]);
  const copy = useCopyMessage();
  const [guessDone, setGuessDone] = useState(!guessFirst);
  const [feedback, setFeedback] = useState<CopyMessage | null>(null);
  const [guessText, setGuessText] = useState("");
  const openedAt = useRef(Date.now());
  /** One hover signal per card-open — guards against StrictMode double effects and
   * re-renders (double-counting was caught in the real-app walkthrough). */
  const hoverSignaled = useRef(false);
  const loaded = useDiglotStore((state) => state.loaded);
  const settings = useDiglotStore((state) => state.settings);
  const recordSignal = useDiglotStore((state) => state.recordSignal);
  const noteGlossSeen = useDiglotStore((state) => state.noteGlossSeen);
  const noteGuessOutcome = useDiglotStore((state) => state.noteGuessOutcome);
  const confusion = useDiglotStore((state) => state.confusionByLemma.get(patch.lemma));
  const targetLang = loaded?.pack.targetLang ?? "en";
  // Strict speaker honesty (Leo 2026-08-16): 🔊 only for a verified provider. The webkit
  // voice list loads lazily — the voiceschanged subscription re-evaluates once it arrives.
  const speakable = useSyncExternalStore(subscribeVoicesChanged, () =>
    canSpeak(targetLang, settings.piperPath, settings.piperModelPath),
  );
  const showSpeaker = settings.ttsEnabled && speakable;

  // The gloss reveal is itself the "hover" lookup signal — but only after any guess gate.
  useEffect(() => {
    if (!guessDone || hoverSignaled.current) return;
    hoverSignaled.current = true;
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
    void useDiglotStore.getState().refreshConfusions();
    void recordSignal(patch.lemma, eventKind, messageId, context, latencyMs);
    setFeedback(guessFeedbackMessage(grade, patch.original));
    setGuessDone(true);
  };

  // Phrase weaves (spec 033 T13) have no dictionary entry and no memory state — a plain
  // gloss card: expression, original, gloss, audio. The guess gate never applies.
  if (patch.kind === "phrase") {
    return (
      <div className="w-64 space-y-1.5 p-3 text-sm text-stone-700">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-medium">{patch.replacement}</span>
          {showSpeaker && (
            <button
              type="button"
              className="ml-auto rounded px-1 text-base hover:bg-stone-100"
              onClick={() =>
                void speakWord(
                  patch.replacement,
                  targetLang,
                  settings.piperPath,
                  settings.piperModelPath,
                )
              }
            >
              🔊
            </button>
          )}
        </div>
        <p>{patch.original}</p>
        {patch.gloss !== undefined && <p className="text-xs text-stone-400">{patch.gloss}</p>}
      </div>
    );
  }

  if (entry === null) return null;

  if (!guessDone) {
    return (
      <div className="w-64 space-y-2 p-3 text-sm text-stone-700">
        <p className="text-xs text-stone-400">{t("learning:diglot.guessPrompt")}</p>
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
            placeholder={t("learning:diglot.guessPlaceholder")}
          />
          <button
            type="submit"
            disabled={guessText.trim().length === 0}
            className="rounded bg-amber-100 px-2 py-1 text-xs text-stone-700 disabled:opacity-40"
          >
            {t("learning:diglot.guessSubmit")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-64 space-y-1.5 p-3 text-sm text-stone-700">
      {feedback !== null && <p className="text-stone-600">{copy(feedback)}</p>}
      <div className="flex items-baseline gap-2">
        <span className="text-base font-medium">{patch.replacement}</span>
        {entry.reading !== "" && <span className="text-xs text-stone-400">{entry.reading}</span>}
        <span className="text-xs text-stone-400">{entry.pos}</span>
        {showSpeaker && (
          <button
            type="button"
            className="ml-auto rounded px-1 text-base hover:bg-stone-100"
            onClick={() => {
              void recordSignal(patch.lemma, "audio", messageId, context, null);
              void speakWord(
                patch.replacement,
                targetLang,
                settings.piperPath,
                settings.piperModelPath,
              );
            }}
          >
            🔊
          </button>
        )}
      </div>
      {confusion !== undefined && (
        <p className="text-stone-400 text-xs">
          {t("learning:diglot.contrastLabel")}:「{confusion.lemma}」是 {confusion.target}
        </p>
      )}
      <p>
        {patch.original}
        {entry.altTargets.length > 0 && (
          <span className="text-xs text-stone-400">
            {" "}
            · {t("learning:diglot.alsoTranslatedAs")} {entry.altTargets.join(", ")}
          </span>
        )}
      </p>
    </div>
  );
}
