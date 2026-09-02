/**
 * Purpose: which of the two builds is running. The desktop and browser editions share every
 * line of feature code, so the few places where the answer genuinely differs — a download URL
 * that has to be same-origin, a settings section that only one build can honour, a page that
 * talks to a program on this machine — ask here instead of guessing from a user agent.
 *
 * The test is Tauri's own injected global rather than a marker exported from apps/web's shims.
 * A marker would only be reachable through the aliased module, so the desktop build would have
 * to import a symbol its real dependency does not export: a bundler error waiting to happen,
 * and one no desktop test would catch. `__TAURI_INTERNALS__` is put on the window by the Tauri
 * runtime before any application script runs — it is what `@tauri-apps/api/core`'s own invoke
 * reads — so it is already there the first time this is called, in dev and in release alike.
 * Anything else (a browser tab, a vitest run) is not the desktop build.
 * Main exports: isBrowserEdition.
 */

/** True in the browser edition: there is no Tauri runtime underneath this page. */
export function isBrowserEdition(): boolean {
  return !("__TAURI_INTERNALS__" in globalThis);
}
