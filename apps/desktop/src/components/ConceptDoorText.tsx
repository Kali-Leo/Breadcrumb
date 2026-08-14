/**
 * Purpose: renders explore-door spans inside an assistant message (spec 039 §2.1-2.2) — a
 * DiglotText twin, simpler: no exposure tracking (doors only react to an explicit open),
 * dashed-underline styling distinct from the weave's teal, guess-gate decided at open,
 * abandonment recorded on close when a guess was never submitted.
 * Main exports: ConceptDoorText.
 */
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { useRef, useState } from "react";
import { contextSentenceFor } from "../lib/contextSentence";
import { useDoorStore } from "../stores/doorStore";
import { ConceptDoorCard } from "./ConceptDoorCard";

/** Rendered card width (Tailwind w-64) — mirrors DiglotText's horizontal clamping. */
const CARD_WIDTH = 256;

interface OpenDoorCard {
  patchStart: number;
  guessFirst: boolean;
  guessResolved: boolean;
  left: number;
  top: number | null;
  bottom: number | null;
}

type DoorSegment = { kind: "text"; text: string } | { kind: "door"; patch: DoorCandidate };

/** Splits `slice` into plain-text runs and door spans (local offsets). pickDoors already
 * guarantees non-overlapping, original-matching spans; any mismatch degrades that one span
 * back to plain text instead of rendering a wrong button. */
function splitDoorSegments(slice: string, patches: readonly DoorCandidate[]): DoorSegment[] {
  const segments: DoorSegment[] = [];
  let cursor = 0;
  for (const patch of patches) {
    if (patch.start < cursor || patch.end > slice.length) continue;
    if (slice.slice(patch.start, patch.end) !== patch.original) continue;
    if (patch.start > cursor)
      segments.push({ kind: "text", text: slice.slice(cursor, patch.start) });
    segments.push({ kind: "door", patch });
    cursor = patch.end;
  }
  if (cursor < slice.length) segments.push({ kind: "text", text: slice.slice(cursor) });
  return segments;
}

export function ConceptDoorText({
  messageId,
  content,
  patches,
  rangeStart,
  rangeEnd,
}: {
  messageId: string;
  content: string;
  patches: DoorCandidate[];
  /** When set, only content[rangeStart, rangeEnd) is rendered; patch offsets stay absolute. */
  rangeStart?: number;
  rangeEnd?: number;
}) {
  const [openCard, setOpenCard] = useState<OpenDoorCard | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const shouldAskGuess = useDoorStore((state) => state.shouldAskGuess);
  const noteGuessOutcome = useDoorStore((state) => state.noteGuessOutcome);

  const base = rangeStart ?? 0;
  const slice = rangeEnd === undefined ? content.slice(base) : content.slice(base, rangeEnd);
  const localPatches = patches.map((patch) => ({
    ...patch,
    start: patch.start - base,
    end: patch.end - base,
  }));
  const segments = splitDoorSegments(slice, localPatches);

  const closeCard = (card: OpenDoorCard) => {
    if (card.guessFirst && !card.guessResolved) noteGuessOutcome(true);
    setOpenCard(null);
  };
  const scheduleClose = (card: OpenDoorCard) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => closeCard(card), 150);
  };

  const openFor = (patchStart: number, nodeId: string, anchor: HTMLElement) => {
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
            guessFirst: shouldAskGuess(nodeId),
            guessResolved: false,
            left,
            top,
            bottom,
          },
    );
  };

  return (
    <span>
      {segments.map((segment) =>
        segment.kind === "text" ? (
          <span key={`t${segment.text.slice(0, 8)}${segment.text.length}`}>{segment.text}</span>
        ) : (
          <span key={`w${segment.patch.start}`} className="relative inline-block">
            <button
              type="button"
              className="cursor-help rounded px-0.5 text-stone-700 underline decoration-amber-400 decoration-dotted underline-offset-2"
              onMouseEnter={(event) => {
                const anchor = event.currentTarget;
                hoverTimer.current = window.setTimeout(
                  () => openFor(segment.patch.start, segment.patch.nodeId, anchor),
                  250,
                );
              }}
              onMouseLeave={() => {
                if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
                if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
              }}
              onClick={(event) =>
                openFor(segment.patch.start, segment.patch.nodeId, event.currentTarget)
              }
              onBlur={() => {
                if (openCard?.patchStart === segment.patch.start) scheduleClose(openCard);
              }}
            >
              {segment.patch.original}
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
                <ConceptDoorCard
                  nodeId={segment.patch.nodeId}
                  messageId={messageId}
                  context={contextSentenceFor(content, {
                    start: segment.patch.start + base,
                    end: segment.patch.end + base,
                  })}
                  guessFirst={openCard.guessFirst}
                  onGuessResolved={() =>
                    setOpenCard((card) => (card === null ? null : { ...card, guessResolved: true }))
                  }
                  onClose={() => setOpenCard(null)}
                />
              </span>
            )}
          </span>
        ),
      )}
    </span>
  );
}
