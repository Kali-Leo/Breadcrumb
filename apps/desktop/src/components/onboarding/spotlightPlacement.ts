/**
 * Purpose: where the tour's spotlight hole and its card go — measuring the real element
 * behind a `data-tour` name, and choosing a card position that stays on screen when the
 * preferred side does not fit. Pure geometry over the live DOM; no React.
 *
 * The card's size is measured, not assumed. It used to be a fixed 320px wide and 220-or-260
 * tall by guess, which on a narrow screen put it partly off the right edge, and in any
 * language whose sentences wrap to one more line put its buttons below the bottom one. Every
 * position here is finally clamped into the viewport, so no step can hide its own way out.
 * Main exports: SpotlightPlace, SpotlightRect, CardSize, CARD_WIDTH, CARD_WIDTH_CSS,
 * defaultCardSize, measureSpotlight, cardPosition.
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

/** The card as it actually rendered. */
export interface CardSize {
  width: number;
  height: number;
}

/** Breathing room between the highlighted element and the hole's edge. */
const PADDING = 8;
/** And between the card and the target, or the card and the screen edge. */
const GAP = 14;
/** The card's preferred width — narrow enough to sit beside a sidebar button — and the
 * margin it keeps from both screen edges when the screen is narrower than that. */
export const CARD_WIDTH = 320;
const SCREEN_MARGIN = 16;
export const CARD_WIDTH_CSS = `min(${CARD_WIDTH}px, calc(100vw - ${SCREEN_MARGIN * 2}px))`;

/** What to place with before the real card has been measured (the first frame of a step). */
export function defaultCardSize(): CardSize {
  const width = Math.min(CARD_WIDTH, Math.max(0, window.innerWidth - SCREEN_MARGIN * 2));
  return { width, height: 220 };
}

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

/** Never below `low`, even when the card is taller or wider than the room there is: an
 * off-screen top edge hides the text, an off-screen bottom edge only hides the end of it. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Where the card goes: beside the hole if it fits, otherwise wherever it does. */
export function cardPosition(
  rect: SpotlightRect | null,
  place: SpotlightPlace | undefined,
  size: CardSize,
): CSSProperties {
  const width = CARD_WIDTH_CSS;
  if (rect === null) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width };
  }
  const { innerWidth, innerHeight } = window;
  const clampTop = (top: number) => clamp(top, GAP, innerHeight - size.height - GAP);
  const clampLeft = (left: number) => clamp(left, GAP, innerWidth - size.width - GAP);
  const preferred = place ?? "bottom";

  if (preferred === "end" && rect.left + rect.width + GAP + size.width <= innerWidth - GAP) {
    return { top: clampTop(rect.top), left: rect.left + rect.width + GAP, width };
  }
  if (preferred === "start" && rect.left - GAP - size.width >= GAP) {
    return { top: clampTop(rect.top), left: rect.left - GAP - size.width, width };
  }
  const above = rect.top - GAP - size.height;
  if (preferred === "top" && above >= GAP) {
    return { top: above, left: clampLeft(rect.left), width };
  }
  // Bottom, and the fallback for everything that did not fit.
  const below = rect.top + rect.height + GAP;
  const fitsBelow = below + size.height <= innerHeight - GAP;
  return {
    top: clampTop(fitsBelow || above < GAP ? below : above),
    left: clampLeft(rect.left),
    width,
  };
}
