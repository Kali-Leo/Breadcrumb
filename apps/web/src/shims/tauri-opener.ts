/**
 * Purpose: stands in for @tauri-apps/plugin-opener in the browser build.
 *
 * The desktop capability set restricts this to http and https so a model-supplied link cannot
 * become a request to open a local file. The same check is applied here — a browser would
 * refuse most of the dangerous schemes anyway, but the guarantee should not depend on which
 * build you happen to be running.
 * Main exports: openUrl.
 */

const OPENABLE_SCHEMES = new Set(["http:", "https:"]);

export async function openUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (!OPENABLE_SCHEMES.has(parsed.protocol)) return;
  // noopener/noreferrer: the opened page must not get a handle back to this one, and the
  // links here come from search results and model output.
  globalThis.open(parsed.href, "_blank", "noopener,noreferrer");
}
