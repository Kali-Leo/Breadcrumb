/**
 * Purpose: the explore/focus sentences that need a decision made in logic — which one
 * applies, and with what values (spec 058 §2). The wording itself lives in the app's
 * learning.json; nothing here is user-visible text.
 * Main exports: conceptDirectRevealMessage, doorExpandPrefillMessage, focusSelectHintMessage,
 * focusErrorMessage, focusBadgeMessage, focusBarTitleMessage.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

/** Ungraded reveal: embedding grading was unavailable, so the door opens straight to the
 * summary with no score and no record (spec 039 §2.2 item 3 degrade path). */
export function conceptDirectRevealMessage(summary: string): CopyMessage {
  return { key: "learning:door.directReveal", params: { summary } };
}

/** Composer prefill for the door card's expand action — the user still presses send. */
export function doorExpandPrefillMessage(label: string): CopyMessage {
  return { key: "learning:door.expandPrefill", params: { label } };
}

/** Selection-confirm hint floated over a focus overlay's main pane (spec 042 §3) — the text
 * is already truncated by the caller (a selection can be long). */
export function focusSelectHintMessage(quotedText: string): CopyMessage {
  return { key: "learning:focus.selectHint", params: { text: quotedText } };
}

/** A raw exception message reads as unreadable jargon (a stack-trace fragment, an English
 * error string) — anything with a 4+ letter ASCII run is treated as raw and dropped in
 * favour of the plain line; a human-readable reason is kept and shown. */
const RAW_LOOKING_PATTERN = /[A-Za-z]{4,}/;

/** Plain-statement error banner for a failed focus-session station (spec 042 §2). */
export function focusErrorMessage(message: string): CopyMessage {
  if (RAW_LOOKING_PATTERN.test(message)) {
    return { key: "learning:focus.errorPlain" };
  }
  return { key: "learning:focus.errorWithReason", params: { reason: message } };
}

/** In-place badge under the message a focus session grew from — one per session with at
 * least one answered station (Leo 2026-08-14 revision to spec 042 §5). */
export function focusBadgeMessage(rootLabel: string, stationCount: number): CopyMessage {
  return { key: "learning:focus.badgeLine", params: { label: rootLabel, count: stationCount } };
}

/** Top-of-chat collapsible bar's folded title — sessionCount counts only sessions with at
 * least one answered station. */
export function focusBarTitleMessage(sessionCount: number): CopyMessage {
  return { key: "learning:focus.barTitle", params: { count: sessionCount } };
}
