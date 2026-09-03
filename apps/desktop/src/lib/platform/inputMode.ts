/**
 * Purpose: is the person driving this screen with a finger or with a pointer? Everything
 * touch-specific in the interface — 44px targets, controls that no longer wait for a hover,
 * Enter that writes a newline — keys off the answer written here as `<html data-input>`, so
 * the components read one attribute (through the `coarse:` / `fine:` variants in App.css)
 * and never re-derive it.
 *
 * Never the user agent: an iPad announces itself as a Mac. The evidence is the pointer
 * hardware itself — `navigator.maxTouchPoints` (0 on every real Mac, non-zero on an iPad),
 * confirmed by the `any-pointer` media feature, with `hover` as the tie-breaker for the
 * hybrids (touch laptops, headless browsers) where the two disagree.
 *
 * Main exports: detectInputMode, applyInputMode, useInputMode, InputMode.
 */
import { useSyncExternalStore } from "react";

export type InputMode = "coarse" | "fine";

/** Test/debug override — `localStorage["breadcrumb.inputMode"]` or `?input=coarse|fine`.
 * A headless browser reports no touch hardware at all, so the touch branches could never be
 * exercised without this. Not a user setting and not documented as one. */
export const INPUT_MODE_OVERRIDE_KEY = "breadcrumb.inputMode";
const INPUT_MODE_QUERY_PARAM = "input";

const COARSE_QUERY = "(any-pointer: coarse)";
const NO_HOVER_QUERY = "(hover: none)";

function isInputMode(value: string | null | undefined): value is InputMode {
  return value === "coarse" || value === "fine";
}

function readOverride(): InputMode | null {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search ?? "").get(
      INPUT_MODE_QUERY_PARAM,
    );
    if (isInputMode(fromUrl)) return fromUrl;
    const stored = globalThis.localStorage?.getItem(INPUT_MODE_OVERRIDE_KEY);
    if (isInputMode(stored)) return stored;
  } catch {
    // Storage access can throw (privacy modes); the hardware answer is still available.
  }
  return null;
}

function matches(query: string): boolean {
  return globalThis.matchMedia?.(query).matches ?? false;
}

/** The hardware answer, override first. */
export function detectInputMode(): InputMode {
  const override = readOverride();
  if (override !== null) return override;
  const touchPoints = globalThis.navigator?.maxTouchPoints ?? 0;
  if (touchPoints <= 0) return "fine";
  if (matches(COARSE_QUERY)) return "coarse";
  // Touch hardware present, yet the media query disagrees: a hybrid or a headless browser.
  // Whether anything can hover settles it.
  return matches(NO_HOVER_QUERY) ? "coarse" : "fine";
}

let current: InputMode = "fine";
let listening = false;
const listeners = new Set<() => void>();

function write(mode: InputMode): void {
  current = mode;
  if (globalThis.document !== undefined) document.documentElement.dataset.input = mode;
}

function refresh(): void {
  const next = detectInputMode();
  if (next === current) return;
  write(next);
  for (const listener of listeners) listener();
}

/** Decide once, stamp `<html data-input>`, and keep following the hardware (a mouse plugged
 * into a tablet flips the media features live). Call before the first render. */
export function applyInputMode(): InputMode {
  write(detectInputMode());
  if (!listening && globalThis.matchMedia !== undefined) {
    listening = true;
    for (const query of [COARSE_QUERY, NO_HOVER_QUERY]) {
      globalThis.matchMedia(query).addEventListener("change", refresh);
    }
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): InputMode => current;
const getServerSnapshot = (): InputMode => "fine";

/** The live answer for components that branch in behaviour, not only in style. */
export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test seam: forget the stamped answer and the media listeners. */
export function resetInputModeForTests(): void {
  current = "fine";
  listening = false;
  listeners.clear();
}
