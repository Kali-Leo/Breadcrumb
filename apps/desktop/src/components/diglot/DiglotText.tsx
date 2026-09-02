/**
 * Purpose: renders a woven assistant message (spec 033) — patch segments with highlighted
 * target words, hover-opened cards (guess gate decided at open), abandonment on close,
 * and viewport exposure signals (once per message per session, in useDiglotExposure). The
 * word and its portal card render in DiglotWordSpan; placement math lives in
 * lib/diglot/diglotCardPosition.
 * Main exports: DiglotText.
 */

import { wovenContextSentenceFor } from "@breadcrumb/core-text";
import type { ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import { applyPatches } from "@breadcrumb/feature-diglot-weave";
import { useEffect, useRef, useState } from "react";
import { computeDiglotCardPosition } from "../../lib/diglot/diglotCardPosition";
import { useDiglotStore } from "../../stores/diglotStore";
import { DiglotWordSpan, type OpenCard } from "./DiglotWordSpan";
import { useDiglotExposure } from "./useDiglotExposure";

/** Rendered card width (Tailwind w-64) — used for horizontal clamping. */
const CARD_WIDTH = 256;

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
  useDiglotExposure({ containerRef, exposureKey, messageId, content, patches, recordSignal });

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
          wovenContextSentenceFor(content, patches, patch),
          null,
        );
      }
    }
    setOpenCard(null);
  };

  // The portal card is fixed-positioned, so any scroll (the chat scroller does not bubble,
  // hence capture) would detach it from its word — close instead, as mouseleave would.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeCard is recreated per render; openCard alone decides (re)subscription
  useEffect(() => {
    if (openCard === null) return;
    const closeOnScroll = () => closeCard(openCard);
    window.addEventListener("scroll", closeOnScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", closeOnScroll, { capture: true });
  }, [openCard]);

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
    const { left, top, bottom } = computeDiglotCardPosition({
      anchor: rect,
      scroller: scroller ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      cardWidth: CARD_WIDTH,
    });
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
          <DiglotWordSpan
            key={`w${segment.patch.start}`}
            patch={segment.patch}
            openCard={openCard?.patchStart === segment.patch.start ? openCard : null}
            entry={loaded.pack.entries[segment.patch.lemma] ?? null}
            context={wovenContextSentenceFor(content, patches, {
              start: segment.patch.start + base,
              end: segment.patch.end + base,
            })}
            messageId={messageId}
            onHoverStart={(anchor) => {
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
            onHoverEnd={() => {
              if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
              if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
            }}
            onActivate={(anchor) =>
              openFor(
                segment.patch.start,
                segment.patch.lemma,
                anchor,
                segment.patch.kind === "phrase",
              )
            }
            onBlurWord={() => {
              if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
            }}
            onCardEnter={() => {
              if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
            }}
            onCardLeave={() => {
              if (openCard !== null) scheduleClose(openCard);
            }}
            onGuessResolved={() =>
              setOpenCard((card) => (card === null ? null : { ...card, guessResolved: true }))
            }
          />
        ),
      )}
    </span>
  );
}
