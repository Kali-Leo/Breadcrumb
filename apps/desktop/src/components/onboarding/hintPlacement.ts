/**
 * Purpose: where a first-use bubble goes — measuring the element it is about, and choosing a
 * side that stays on screen when the preferred one does not fit. Pure geometry over the live
 * DOM; no React.
 *
 * The bubble's size is measured, not assumed, and every position is finally clamped into the
 * viewport, so a sentence that wraps to one more line in another language can never push
 * itself off the edge. The answer also says which side was taken and where along the
 * bubble's edge the element's centre falls, which is where the arrow is drawn.
 * Main exports: HintPlace, AnchorRect, BubbleSize, BubbleLayout, BUBBLE_WIDTH_CSS,
 * isRightToLeft, measureAnchor, bubbleLayout.
 */

/** Which side of the element the bubble prefers. `start`/`end` are the reading-order sides,
 * so a bubble that wants to sit "after" a sidebar icon gets the right side in English and the
 * left side in Arabic — the same rule CSS uses for `inset-inline-start`. */
export type HintPlace = "top" | "bottom" | "start" | "end";

/** The physical side the bubble actually took. */
export type BubbleSide = "top" | "bottom" | "left" | "right";

/** True when the document is laid out right-to-left. Read from the live document rather than
 * from the language table: the same attribute the stylesheet's logical properties follow, so
 * the bubble can never end up on the opposite side from the layout it is pointing at. */
export function isRightToLeft(): boolean {
  const root = globalThis.document?.documentElement;
  const dir = root?.getAttribute("dir") ?? root?.dir ?? "";
  return dir.toLowerCase() === "rtl";
}

function physicalSide(place: "start" | "end", rightToLeft: boolean): "left" | "right" {
  const isEnd = place === "end";
  return isEnd === rightToLeft ? "left" : "right";
}

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The bubble as it actually rendered. */
export interface BubbleSize {
  width: number;
  height: number;
}

export interface BubbleLayout {
  top: number;
  left: number;
  side: BubbleSide;
  /** Where the arrow sits along the edge facing the element: pixels from the bubble's left
   * edge for a top/bottom bubble, from its top edge for a left/right one. */
  arrow: number;
}

/** Room between the element and the bubble — the arrow lives in it. */
const GAP = 10;
/** The bubble keeps this much from every screen edge. */
const SCREEN_MARGIN = 12;
/** The arrow never sits inside the bubble's rounded corner. */
const ARROW_INSET = 14;
/** Where the arrow goes along a bubble that sits at the start of a wide element. */
const WIDE_ARROW = 28;
const BUBBLE_WIDTH = 260;
export const BUBBLE_WIDTH_CSS = `min(${BUBBLE_WIDTH}px, calc(100vw - ${SCREEN_MARGIN * 2}px))`;

export function measureAnchor(element: Element): AnchorRect | null {
  if (!element.isConnected) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/** Never below `low`, even when the bubble is taller or wider than the room there is: an
 * off-screen top edge hides the text, an off-screen bottom edge only hides the end of it. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function bubbleLayout(rect: AnchorRect, place: HintPlace, size: BubbleSize): BubbleLayout {
  const { innerWidth, innerHeight } = window;
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  const clampTop = (top: number) => clamp(top, SCREEN_MARGIN, innerHeight - size.height - GAP);
  const clampLeft = (left: number) => clamp(left, SCREEN_MARGIN, innerWidth - size.width - GAP);
  const beside = (side: "left" | "right", left: number): BubbleLayout => {
    const top = clampTop(centreY - size.height / 2);
    return { top, left, side, arrow: clamp(centreY - top, ARROW_INSET, size.height - ARROW_INSET) };
  };
  const stacked = (side: "top" | "bottom", top: number, centred = false): BubbleLayout => {
    // A bubble centred under a field that spans the page would float far from its edge; a
    // wide element gets the bubble at its reading-order start instead, arrow just inside.
    if (rect.width > size.width && !centred) {
      const start = isRightToLeft() ? rect.left + rect.width - size.width : rect.left;
      const left = clampLeft(start);
      const arrow = isRightToLeft() ? size.width - WIDE_ARROW : WIDE_ARROW;
      return { top, left, side, arrow };
    }
    const left = clampLeft(centreX - size.width / 2);
    return { top, left, side, arrow: clamp(centreX - left, ARROW_INSET, size.width - ARROW_INSET) };
  };

  if (place === "start" || place === "end") {
    const side = physicalSide(place, isRightToLeft());
    const rightEdge = rect.left + rect.width + GAP;
    if (side === "right" && rightEdge + size.width <= innerWidth - SCREEN_MARGIN) {
      return beside("right", rightEdge);
    }
    const leftEdge = rect.left - GAP - size.width;
    if (side === "left" && leftEdge >= SCREEN_MARGIN) {
      return beside("left", leftEdge);
    }
  }
  const above = rect.top - GAP - size.height;
  if (place === "top" && above >= SCREEN_MARGIN) return stacked("top", above);
  // Below, and the fallback for everything that did not fit.
  const below = rect.top + rect.height + GAP;
  const fitsBelow = below + size.height <= innerHeight - SCREEN_MARGIN;
  if (fitsBelow) return stacked("bottom", below);
  if (above >= SCREEN_MARGIN) return stacked("top", above);
  // Nothing fits: the element is about as large as the screen, so the bubble sits inside
  // its lower edge, centred, with the arrow pointing up into it.
  return stacked("bottom", clampTop(below), true);
}
