/**
 * Purpose: pure placement math for the diglot word-card popover (portal-rendered with
 * position:fixed) — clamps horizontally inside the chat scroller and flips below the word
 * when the viewport top is too close for the card to open upward.
 * Main exports: computeDiglotCardPosition, DiglotCardPosition.
 */

/** Exactly one of top/bottom is set: bottom anchors the card's lower edge above the word
 * (default), top anchors it below the word (flip near the viewport top). */
export interface DiglotCardPosition {
  left: number;
  top: number | null;
  bottom: number | null;
}

/** Vertical space above the word under which the card flips to open downward. */
export const FLIP_BELOW_THRESHOLD_PX = 220;

/** Gap between the word and the card, and between the card and the scroller edges. */
const EDGE_GAP_PX = 8;
const ANCHOR_GAP_PX = 4;

export function computeDiglotCardPosition(input: {
  /** The hovered word's viewport rect (getBoundingClientRect subset). */
  anchor: { left: number; top: number; bottom: number };
  /** The enclosing scroll container's viewport rect, when one exists. */
  scroller: { left: number; right: number } | null;
  viewport: { width: number; height: number };
  cardWidth: number;
}): DiglotCardPosition {
  const minLeft = (input.scroller?.left ?? 0) + EDGE_GAP_PX;
  const maxLeft = (input.scroller?.right ?? input.viewport.width) - input.cardWidth - EDGE_GAP_PX;
  const left = Math.min(Math.max(input.anchor.left, minLeft), Math.max(maxLeft, minLeft));
  const flipBelow = input.anchor.top < FLIP_BELOW_THRESHOLD_PX;
  return {
    left,
    top: flipBelow ? input.anchor.bottom + ANCHOR_GAP_PX : null,
    bottom: flipBelow ? null : input.viewport.height - input.anchor.top + ANCHOR_GAP_PX,
  };
}
