/**
 * Purpose: does the shell have room for a permanent sidebar beside the content ("wide"), or
 * does everything stack and the sidebar become a drawer ("stacked")? The rule is written once
 * as CSS in App.css (the `stacked:` / `wide:` variants) and mirrored here for the few places
 * that must branch in JavaScript — whether the drawer is inert, whether a tour step has to
 * open it. Keep the two strings identical.
 *
 * Narrow or portrait: a 1024×1366 iPad Pro held upright stacks, the same tablet on its side
 * does not, and nothing at or above 1024px wide in landscape ever changes.
 * Main exports: STACKED_MEDIA_QUERY, useLayoutMode, LayoutMode.
 */
import { useSyncExternalStore } from "react";

export type LayoutMode = "stacked" | "wide";

export const STACKED_MEDIA_QUERY = "(max-width: 1023.98px), (orientation: portrait)";

function subscribe(listener: () => void): () => void {
  if (globalThis.matchMedia === undefined) return () => {};
  const list = globalThis.matchMedia(STACKED_MEDIA_QUERY);
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}

function getSnapshot(): LayoutMode {
  return globalThis.matchMedia?.(STACKED_MEDIA_QUERY).matches ? "stacked" : "wide";
}

const getServerSnapshot = (): LayoutMode => "wide";

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
