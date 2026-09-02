/**
 * Purpose: where the tour's spotlight hole and its card go — measuring the real element
 * behind a `data-tour` name, and choosing a card position that stays on screen when the
 * preferred side does not fit. Pure geometry over the live DOM; no React.
 * Main exports: SpotlightPlace, SpotlightRect, CARD_WIDTH, measureSpotlight, cardPosition.
 */
import type { CSSProperties } from "react";

/** Which side of the target the card prefers. */
export type SpotlightPlace = "top" | "bottom" | "start" | "end";

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room between the highlighted element and the hole's edge. */
const PADDING = 8;
/** The card's fixed width — narrow enough to sit beside a sidebar button. */
export const CARD_WIDTH = 320;

export function measureSpotlight(target: string | undefined): SpotlightRect | null {
  if (target === undefined) return null;
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (element === null) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };
}

/** Where the card goes: beside the hole if it fits, otherwise wherever it does. */
export function cardPosition(
  rect: SpotlightRect | null,
  place: SpotlightPlace | undefined,
): CSSProperties {
  if (rect === null) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: CARD_WIDTH };
  }
  const gap = 14;
  const { innerWidth, innerHeight } = window;
  const preferred = place ?? "bottom";

  if (preferred === "end" && rect.left + rect.width + gap + CARD_WIDTH < innerWidth) {
    return {
      top: Math.min(rect.top, innerHeight - 260),
      left: rect.left + rect.width + gap,
      width: CARD_WIDTH,
    };
  }
  if (preferred === "start" && rect.left - gap - CARD_WIDTH > 0) {
    return {
      top: Math.min(rect.top, innerHeight - 260),
      left: rect.left - gap - CARD_WIDTH,
      width: CARD_WIDTH,
    };
  }
  if (preferred === "top" && rect.top - gap > 220) {
    return {
      top: rect.top - gap - 200,
      left: Math.min(Math.max(rect.left, gap), innerWidth - CARD_WIDTH - gap),
      width: CARD_WIDTH,
    };
  }
  // Bottom, and the fallback for everything that did not fit.
  const below = rect.top + rect.height + gap;
  return {
    top: below + 220 < innerHeight ? below : Math.max(gap, rect.top - gap - 200),
    left: Math.min(Math.max(rect.left, gap), innerWidth - CARD_WIDTH - gap),
    width: CARD_WIDTH,
  };
}
