/**
 * Purpose: one woven word inside a rendered assistant message (spec 033) — the highlighted
 * button and, while its card is open, the card itself. The card renders through
 * createPortal(document.body): DiglotText lives inside markdown <p> elements, and the card's
 * block content is invalid DOM there (React nesting warnings) besides getting clipped by
 * scroll containers. All open/close state lives in DiglotText; this only draws.
 *
 * The mouse handlers are bound only when something can actually hover: on a touch screen
 * mouseleave never fires, so a card opened by a tap could never be closed by one (the word
 * also sticks in its :hover colours — WebKit bug 158517, open since 2016). There the card is
 * closed by a press somewhere else, which DiglotText finds through the two data attributes
 * marked below.
 * Main exports: DiglotWordSpan, OpenCard.
 */
import type { PackEntry, ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import { createPortal } from "react-dom";
import { DiglotWordCard } from "./DiglotWordCard";

export interface OpenCard {
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

interface DiglotWordSpanProps {
  patch: ReplacementPatch;
  /** Non-null only while this word's card is the open one. */
  openCard: OpenCard | null;
  entry: PackEntry | null;
  /** The WOVEN sentence: the raw one would print the source word the card is asking the
   * learner to recall (audit 2026-08-28 #1). */
  context: string;
  messageId: string;
  /** False on a touch screen: no mouseenter/mouseleave/blur handlers are bound at all. */
  hoverEnabled: boolean;
  onHoverStart(anchor: HTMLElement): void;
  onHoverEnd(): void;
  onActivate(anchor: HTMLElement): void;
  onBlurWord(): void;
  onCardEnter(): void;
  onCardLeave(): void;
  onGuessResolved(): void;
}

export function DiglotWordSpan({
  patch,
  openCard,
  entry,
  context,
  messageId,
  hoverEnabled,
  onHoverStart,
  onHoverEnd,
  onActivate,
  onBlurWord,
  onCardEnter,
  onCardLeave,
  onGuessResolved,
}: DiglotWordSpanProps) {
  return (
    <span className="relative inline-block">
      <button
        type="button"
        data-diglot-word
        className="cursor-help rounded bg-teal-50 px-0.5 text-teal-800 underline decoration-teal-300 decoration-dotted underline-offset-2"
        onMouseEnter={hoverEnabled ? (event) => onHoverStart(event.currentTarget) : undefined}
        onMouseLeave={hoverEnabled ? onHoverEnd : undefined}
        onClick={(event) => onActivate(event.currentTarget)}
        onBlur={hoverEnabled ? onBlurWord : undefined}
      >
        {patch.replacement}
      </button>
      {openCard !== null &&
        // Portal: the card's block content may not live inside the markdown <p>
        // (invalid DOM nesting), and body-level rendering escapes clipping.
        createPortal(
          <div
            role="tooltip"
            data-diglot-card
            style={{
              position: "fixed",
              left: openCard.left,
              top: openCard.top ?? undefined,
              bottom: openCard.bottom ?? undefined,
            }}
            className="z-20 rounded-xl border border-stone-200 bg-white shadow-lg"
            onMouseEnter={hoverEnabled ? onCardEnter : undefined}
            onMouseLeave={hoverEnabled ? onCardLeave : undefined}
          >
            <DiglotWordCard
              patch={patch}
              entry={entry}
              context={context}
              messageId={messageId}
              guessFirst={openCard.guessFirst}
              onGuessResolved={onGuessResolved}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
