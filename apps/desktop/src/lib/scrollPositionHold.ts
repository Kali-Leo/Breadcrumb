/**
 * Purpose: hold scrolled areas still while a full-screen layer is open, and put them back exactly
 * where they were when it closes — so the reader who opened an item halfway down the feed lands
 * back on that item, not at the top (spec 053 §7, Leo's report 2026-08-18).
 * Main exports: holdScrollPosition.
 */

interface HeldElement {
  element: HTMLElement;
  /** The inline value only, so a released element goes back to whatever the stylesheet says. */
  inlineOverflow: string;
  scrollTop: number;
  scrollLeft: number;
}

/**
 * Freezes the given elements where they are and returns the release. Nulls are skipped, so callers
 * can hand over a ref's current value without checking it first. Calling the release twice is
 * harmless. Nested layers each hold and release independently: every hold records the position it
 * found, and since a held element cannot move, they all record and restore the same position.
 */
export function holdScrollPosition(
  elements: readonly (HTMLElement | null | undefined)[],
): () => void {
  const held: HeldElement[] = [];
  for (const element of elements) {
    if (element === null || element === undefined) continue;
    held.push({
      element,
      inlineOverflow: element.style.overflow,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
    });
    element.style.overflow = "hidden";
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const one of held) {
      one.element.style.overflow = one.inlineOverflow;
      // Written back after the overflow, because an element only accepts a scroll position once
      // it can scroll again.
      one.element.scrollTop = one.scrollTop;
      one.element.scrollLeft = one.scrollLeft;
    }
  };
}
