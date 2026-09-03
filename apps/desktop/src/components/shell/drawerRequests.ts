/**
 * Purpose: the one message the tour needs to send the shell — "I am about to point at this
 * element; if it lives in the sidebar drawer, open it". A window event rather than a bus
 * event: the bus's map is a shared package contract, and this concerns two files in the shell.
 * On a wide screen the sidebar is always visible and the shell ignores the request.
 * Main exports: requestDrawerFor, onDrawerRequest.
 */

const EVENT_NAME = "breadcrumb:drawer-request";

/** `target` is a `data-tour` value, or undefined for a step that points at nothing. */
export function requestDrawerFor(target: string | undefined): void {
  globalThis.dispatchEvent?.(new CustomEvent<string | undefined>(EVENT_NAME, { detail: target }));
}

export function onDrawerRequest(handler: (target: string | undefined) => void): () => void {
  const listener = (event: Event): void => {
    handler((event as CustomEvent<string | undefined>).detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
