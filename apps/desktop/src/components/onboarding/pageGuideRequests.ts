/**
 * Purpose: the two messages the page guides need from outside their own component tree —
 * "show the guide for whatever page is open" (the ? in the sidebar) and "hold them back for
 * now" (while the guided tour is walking the app on its own).
 *
 * A window event and a module flag rather than a store: neither fact is worth persisting, and
 * neither belongs in the shared event bus, whose map is a package-level contract.
 * Main exports: requestPageGuide, onPageGuideRequest, setPageGuidesHeld, pageGuidesHeld.
 */

const EVENT_NAME = "breadcrumb:page-guide-request";

/** Someone asked for the open page's guide, whether or not it has been read before. */
export function requestPageGuide(): void {
  globalThis.dispatchEvent?.(new CustomEvent(EVENT_NAME));
}

export function onPageGuideRequest(handler: () => void): () => void {
  const listener = (): void => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/** The guided tour switches views on its own. A card popping up over a spotlight would fight
 * it, so the tour holds the guides back while it runs; the pages it passed through stay
 * unread and get their guide the next time the reader opens them. */
let held = false;

export function setPageGuidesHeld(value: boolean): void {
  held = value;
}

export function pageGuidesHeld(): boolean {
  return held;
}
