/**
 * Purpose: renders a woven assistant message (spec 033) — patch segments with highlighted
 * target words, hover-opened cards (guess gate decided at open), abandonment on close,
 * and viewport exposure signals (once per message per session). The card renders through
 * createPortal(document.body): DiglotText lives inside markdown <p> elements, and the
 * card's block content is invalid DOM there (React nesting warnings) besides getting
 * clipped by scroll containers; placement math lives in lib/diglotCardPosition.
 * Main exports: DiglotText.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import { applyPatches } from "@breadcrumb/plugin-diglot-weave";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { wovenContextSentenceFor } from "../lib/contextSentence";
import { computeDiglotCardPosition } from "../lib/diglotCardPosition";
import { useDiglotStore } from "../stores/diglotStore";
import { DiglotWordCard } from "./DiglotWordCard";

/** Runs whose exposure signals already fired this session — a duplicate-event guard only.
 * It is deliberately not persisted and not pruned; placement no longer trusts it, because a
 * restart replays exposures for old messages: the store re-checks the event log before any
 * exposure counts as first-encounter evidence (audit 2026-08-28 #2d). */
const exposedMessages = new Set<string>();

/** Rendered card width (Tailwind w-64) — used for horizontal clamping. */
const CARD_WIDTH = 256;

interface OpenCard {
  patchStart: number;
  guessFirst: boolean;
  guessResolved: boolean;
  /** Fixed-position viewport anchor from the word's getBoundingClientRect, computed by
   * computeDiglotCardPosition (clamped inside the scroller; exactly one of top/bottom is
   * set — cards flip below the word near the viewport top). */
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
                  wovenContextSentenceFor(content, patches, patch),
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
            {openCard?.patchStart === segment.patch.start &&
              // Portal: the card's block content may not live inside the markdown <p>
              // (invalid DOM nesting), and body-level rendering escapes clipping.
              createPortal(
                <div
                  role="tooltip"
                  style={{
                    position: "fixed",
                    left: openCard.left,
                    top: openCard.top ?? undefined,
                    bottom: openCard.bottom ?? undefined,
                  }}
                  className="z-20 rounded-xl border border-stone-200 bg-white shadow-lg"
                  onMouseEnter={() => {
                    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
                  }}
                  onMouseLeave={() => scheduleClose(openCard)}
                >
                  <DiglotWordCard
                    patch={segment.patch}
                    entry={loaded.pack.entries[segment.patch.lemma] ?? null}
                    // The WOVEN sentence: the raw one would print the source word the
                    // card is asking the learner to recall (audit 2026-08-28 #1).
                    context={wovenContextSentenceFor(content, patches, {
                      start: segment.patch.start + base,
                      end: segment.patch.end + base,
                    })}
                    messageId={messageId}
                    guessFirst={openCard.guessFirst}
                    onGuessResolved={() =>
                      setOpenCard((card) =>
                        card === null ? null : { ...card, guessResolved: true },
                      )
                    }
                  />
                </div>,
                document.body,
              )}
          </span>
        ),
      )}
    </span>
  );
}
