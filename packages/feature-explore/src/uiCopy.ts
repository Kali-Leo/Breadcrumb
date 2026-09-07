/**
 * Purpose: the explore/focus sentences that need a decision made in logic — which one
 * applies, and with what values. The wording itself lives in the app's learning.json; nothing
 * here is user-visible text.
 * Main exports: conceptDirectRevealMessage, focusSelectHintMessage, focusErrorMessage,
 * focusBadgeMessage, focusBarTitleMessage.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

/** Ungraded reveal: embedding grading was unavailable, so the door opens straight to the
 * summary with no score and no record. */
export function conceptDirectRevealMessage(summary: string): CopyMessage {
  return { key: "learning:door.directReveal", params: { summary } };
}

/** Selection-confirm hint floated over a focus overlay's main pane — the text is already
 * truncated by the caller (a selection can be long). */
export function focusSelectHintMessage(quotedText: string): CopyMessage {
  return { key: "learning:focus.selectHint", params: { text: quotedText } };
}

/** A raw exception message reads as unreadable jargon (a stack-trace fragment, an English
 * error string) — anything with a 4+ letter ASCII run is treated as raw and dropped in
 * favour of the plain line; a human-readable reason is kept and shown. */
const RAW_LOOKING_PATTERN = /[A-Za-z]{4,}/;

/** Plain-statement error banner for a failed focus-session station. */
export function focusErrorMessage(message: string): CopyMessage {
  if (RAW_LOOKING_PATTERN.test(message)) {
    return { key: "learning:focus.errorPlain" };
  }
  return { key: "learning:focus.errorWithReason", params: { reason: message } };
}

/** In-place badge under the message a focus session grew from — one per session with at
 * least one answered station. */
export function focusBadgeMessage(rootLabel: string, stationCount: number): CopyMessage {
  return { key: "learning:focus.badgeLine", params: { label: rootLabel, count: stationCount } };
}

/** Top-of-chat collapsible bar's folded title — sessionCount counts only sessions with at
 * least one answered station. */
export function focusBarTitleMessage(sessionCount: number): CopyMessage {
  return { key: "learning:focus.barTitle", params: { count: sessionCount } };
}
