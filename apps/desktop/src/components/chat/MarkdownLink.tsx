/**
 * Purpose: the markdown link node's rendering. The webview must never navigate to an
 * address the model chose: this window has no address bar, so a page loaded in it is
 * indistinguishable from the app itself. Hand it to the system browser, as every other
 * outbound link does (FactcheckBadge) — https only, which is the whole of the opener
 * capability's allow list, so an http:// or mailto: link looks the same and quietly does
 * nothing. The scheme check stays: React refuses javascript: URLs, but one framework
 * behaviour is a thin only-check.
 * Main exports: MarkdownLink.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";

/** Schemes a link in model output may carry. Anything else renders as inert text rather than
 * a clickable target. */
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(url: string | undefined): url is string {
  if (url === undefined) return false;
  try {
    return SAFE_LINK_SCHEMES.has(new URL(url, "https://example.invalid").protocol);
  } catch {
    return false;
  }
}

export function MarkdownLink({ url, children }: { url: string | undefined; children: ReactNode }) {
  return isSafeHref(url) ? (
    <button
      type="button"
      onClick={() => {
        if (url.startsWith("https://")) void openUrl(url);
      }}
      className="inline text-start text-amber-700 underline"
    >
      {children}
    </button>
  ) : (
    // An <a> with no href was not clickable either; the text keeps exactly its old look.
    <span className="text-amber-700 underline">{children}</span>
  );
}
