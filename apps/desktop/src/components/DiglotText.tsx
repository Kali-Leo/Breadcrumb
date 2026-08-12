/**
 * Purpose: renders a woven assistant message (spec 033) — patch segments with highlighted
 * target words, hover-opened cards (guess gate decided at open), abandonment on close,
 * and viewport exposure signals (once per message per session).
 * Main exports: DiglotText.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import { applyPatches } from "@breadcrumb/plugin-diglot-weave";
import { useEffect, useRef, useState } from "react";
import { useDiglotStore } from "../stores/diglotStore";
import { DiglotWordCard } from "./DiglotWordCard";

/** Messages whose exposure signals already fired this session. */
const exposedMessages = new Set<string>();

/** The sentence around a patch — guess cards always show real context. */
function contextSentenceFor(content: string, patch: ReplacementPatch): string {
  const boundary = /[。!?.!?\n]/;
  let start = patch.start;
  while (start > 0 && !boundary.test(content[start - 1] ?? "")) start -= 1;
  let end = patch.end;
  while (end < content.length && !boundary.test(content[end] ?? "")) end += 1;
  return content.slice(start, Math.min(end + 1, content.length)).trim();
}

/** Rendered card width (Tailwind w-64) — used for horizontal clamping. */
const CARD_WIDTH = 256;

interface OpenCard {
  patchStart: number;
  guessFirst: boolean;
  guessResolved: boolean;
  /** Fixed-position anchor, clamped inside the chat scroll container — absolute
   * positioning got clipped by overflow-y-auto in narrow layouts (real-app walkthrough).
   * Exactly one of top/bottom is set: cards flip below the word near the viewport top. */
  left: number;
  top: number | null;
  bottom: number | null;
}

export function DiglotText({
  messageId,
  content,
  patches,
  rangeStart,
  rangeEnd,
}: {
  messageId: string;
  content: string;
  patches: ReplacementPatch[];
  /** When set, only content[rangeStart, rangeEnd) is rendered (markdown text nodes);
   * patch offsets stay absolute into `content`. */
  rangeStart?: number;
  rangeEnd?: number;
}) {
  const [openCard, setOpenCard] = useState<OpenCard | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const loaded = useDiglotStore((state) => state.loaded);
  const shouldAskGuess = useDiglotStore((state) => state.shouldAskGuess);
  const recordSignal = useDiglotStore((state) => state.recordSignal);
  const noteGuessOutcome = useDiglotStore((state) => state.noteGuessOutcome);

  // One markdown message may render several DiglotText runs — dedupe exposure per run.
  const exposureKey = `${messageId}:${rangeStart ?? 0}`;

  // Exposure: fires once per run per session after the bubble stays ≥50% visible ~1s.
  useEffect(() => {
    const element = containerRef.current;
    if (element === null || exposedMessages.has(exposureKey)) return;
    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && dwellTimer === null) {
            dwellTimer = window.setTimeout(() => {
              if (exposedMessages.has(exposureKey)) return;
              exposedMessages.add(exposureKey);
              for (const patch of patches) {
                void recordSignal(
                  patch.lemma,
                  "exposure",
                  messageId,
                  contextSentenceFor(content, patch),
                  null,
                );
              }
            }, 1000);
          } else if (!entry.isIntersecting && dwellTimer !== null) {
            window.clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [exposureKey, messageId, content, patches, recordSignal]);

  const closeCard = (card: OpenCard) => {
    if (card.guessFirst && !card.guessResolved) {
      // card.patchStart is slice-local; patches keep absolute offsets.
      const patch = patches.find((p) => p.start - (rangeStart ?? 0) === card.patchStart);
      if (patch !== undefined) {
        noteGuessOutcome(true);
        void recordSignal(
          patch.lemma,
          "guess_abandoned",
          messageId,
          contextSentenceFor(content, patch),
          null,
        );
      }
    }
    setOpenCard(null);
  };

  const base = rangeStart ?? 0;
  const slice = rangeEnd === undefined ? content.slice(base) : content.slice(base, rangeEnd);
  const localPatches = patches.map((patch) => ({
    ...patch,
    start: patch.start - base,
    end: patch.end - base,
  }));
  const segments = applyPatches(slice, localPatches);
  if (segments === null || loaded === null) return <>{slice}</>;

  const openFor = (patchStart: number, lemma: string, anchor: HTMLElement, isPhrase: boolean) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    const rect = anchor.getBoundingClientRect();
    const scroller = anchor.closest(".overflow-y-auto")?.getBoundingClientRect();
    const minLeft = (scroller?.left ?? 0) + 8;
    const maxLeft = (scroller?.right ?? window.innerWidth) - CARD_WIDTH - 8;
    const left = Math.min(Math.max(rect.left, minLeft), Math.max(maxLeft, minLeft));
    const flipBelow = rect.top < 220;
    const top = flipBelow ? rect.bottom + 4 : null;
    const bottom = flipBelow ? null : window.innerHeight - rect.top + 4;
    setOpenCard((card) =>
      card?.patchStart === patchStart
        ? card
        : {
            patchStart,
            // Phrase weaves have no memory state — the guess gate never applies to them.
            guessFirst: isPhrase ? false : shouldAskGuess(lemma),
            guessResolved: false,
            left,
            top,
            bottom,
          },
    );
  };
  // A short grace period bridges the gap between the word and its card.
  const scheduleClose = (card: OpenCard) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => closeCard(card), 150);
  };

  return (
    <span ref={containerRef}>
      {segments.map((segment) =>
        segment.kind === "text" ? (
          <span key={`t${segment.text.slice(0, 8)}${segment.text.length}`}>{segment.text}</span>
        ) : (
          <span key={`w${segment.patch.start}`} className="relative inline-block">
            <button
              type="button"
              className="cursor-help rounded bg-teal-50 px-0.5 text-teal-800 underline decoration-teal-300 decoration-dotted underline-offset-2"
              onMouseEnter={(event) => {
                const anchor = event.currentTarget;
                hoverTimer.current = window.setTimeout(
                  () =>
                    openFor(
                      segment.patch.start,
                      segment.patch.lemma,
                      anchor,
                      segment.patch.kind === "phrase",
                    ),
                  250,
                );
              }}
              onMouseLeave={() => {
                if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
                if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
              }}
              onClick={(event) =>
                openFor(
                  segment.patch.start,
                  segment.patch.lemma,
                  event.currentTarget,
                  segment.patch.kind === "phrase",
                )
              }
              onBlur={() => {
                if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
              }}
            >
              {segment.patch.replacement}
            </button>
            {openCard?.patchStart === segment.patch.start && (
              <span
                role="tooltip"
                style={{
                  position: "fixed",
                  left: openCard.left,
                  top: openCard.top ?? undefined,
                  bottom: openCard.bottom ?? undefined,
                }}
                className="z-20 block rounded-xl border border-stone-200 bg-white shadow-lg"
                onMouseEnter={() => {
                  if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
                }}
                onMouseLeave={() => scheduleClose(openCard)}
              >
                <DiglotWordCard
                  patch={segment.patch}
                  entry={loaded.pack.entries[segment.patch.lemma] ?? null}
                  context={contextSentenceFor(content, {
                    ...segment.patch,
                    start: segment.patch.start + base,
                    end: segment.patch.end + base,
                  })}
                  messageId={messageId}
                  guessFirst={openCard.guessFirst}
                  onGuessResolved={() =>
                    setOpenCard((card) => (card === null ? null : { ...card, guessResolved: true }))
                  }
                />
              </span>
            )}
          </span>
        ),
      )}
    </span>
  );
}
