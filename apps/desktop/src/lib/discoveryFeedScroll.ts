/**
 * Purpose: the one place that knows which element the discovery feed scrolls in, so that redrawing
 * the feed (spec 054, Leo's fifth point — 「整流换掉」) can actually put the reader back at the top
 * instead of leaving them halfway down a list that has been replaced underneath them. The feed page
 * registers its scrolling element on mount; the store calls this without importing React or the DOM
 * tree it belongs to.
 * Side effects: holds a reference to one element and sets its scrollTop.
 * Main exports: registerDiscoveryFeedScroller, scrollDiscoveryFeedToTop.
 */

let scroller: HTMLElement | null = null;

/** Null on unmount, so a page that has gone away is never scrolled. */
export function registerDiscoveryFeedScroller(element: HTMLElement | null): void {
  scroller = element;
}

export function scrollDiscoveryFeedToTop(): void {
  // Assigned rather than animated: the cards under the reader are being replaced in the same
  // moment, and a scroll that glides past a list they can no longer follow is worse than a jump.
  if (scroller !== null) scroller.scrollTop = 0;
}
