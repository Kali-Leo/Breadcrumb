/**
 * Purpose: every user-visible string of explore doors, the sidebar's trail cards/groups, and
 * the focus (explain-word) overlay (spec 039 §2.2; spec 041; spec 042 §3, §5) in one place —
 * plain statements only (product principle 1: no praise, no performed warmth); simlab scans
 * this module against the pressure lexicon.
 * Main exports: EXPLORE_UI_COPY, conceptDirectRevealLine, doorExpandPrefill, focusSelectHint,
 * focusErrorLine, focusBadgeLine, focusBarTitle.
 */

/** Static UI strings (door card, sidebar trail cards, focus overlay). Keys exist so the simlab
 * scan can name a hit. */
export const EXPLORE_UI_COPY = {
  doorGuessPrompt: "先猜猜：一句话说它是什么？",
  doorGuessPlaceholder: "你的猜测",
  doorGuessSubmit: "提交",
  doorExpandButton: "展开聊聊",
  /** Sidebar "正在进行" section header (spec 041 §2) — today's active trails, a preview. */
  ongoingSectionLabel: "正在进行",
  /** Group label for trails with no dominant knowledge node (spec 041 §2). */
  casualChatGroupLabel: "随手聊",
  /** Bottom-of-sidebar toggle into the flat, time-ordered trail list (spec 041 §2). */
  timelineToggleLabel: "按时间浏览",
  /** Focus overlay header (spec 042 §3). */
  focusExitButton: "退出专注",
  focusAskPlaceholder: "对当前内容提问…",
  /** Guess card's skip action — still opens the explanation, just without a scored guess. */
  focusGuessSkipButton: "直接看解释",
  /** Retries the current focus station after a failure or watchdog timeout (2026-08-14). */
  focusRetryButton: "重试",
  /** Exit-record card's reopen action (spec 042 §5). */
  focusEntryReturnButton: "回到专注",
  /** Header's back-to-parent action (spec 042 §4 nav fix) — hidden at the root station. */
  focusUpButton: "← 上一级",
  /** One-line operation hint under the subway map (spec 042 §4). */
  focusMapHint: "点一个站可以跳过去。实线是从文中选词长出来的，虚线是提问长出来的。",
} as const;

/** Ungraded reveal line: embedding grading was unavailable, so the door opens straight to
 * the summary with no score and no record (spec 039 §2.2 item 3 degrade path). */
export function conceptDirectRevealLine(summary: string): string {
  return `它是指：${summary}`;
}

/** Composer prefill for the door card's "展开聊聊" action — the user still presses send. */
export function doorExpandPrefill(label: string): string {
  return `关于「${label}」，我想继续深入：`;
}

/** Selection-confirm hint floated over a focus overlay's main pane (spec 042 §3) — the word
 * is already truncated by the caller (selection text can be long). */
export function focusSelectHint(quotedText: string): string {
  return `按 Enter 解释「${quotedText}」`;
}

/** A raw exception message reads as unreadable jargon (a stack-trace fragment, an English
 * error string) — anything with a 4+ letter ASCII run is treated as raw and swapped for the
 * generic line instead of interpolated; a crafted Chinese line (short acronyms like "API"
 * included) passes through untouched. */
const RAW_LOOKING_PATTERN = /[A-Za-z]{4,}/;

/** Plain-statement error banner for a failed focus-session station (spec 042 §2). */
export function focusErrorLine(message: string): string {
  if (RAW_LOOKING_PATTERN.test(message)) {
    return "这一站没有生成成功。可以重试，或退出专注。";
  }
  return `这一站没有生成成功：${message}。可以重试，或退出专注。`;
}

/** In-place badge line under the message a focus session grew from — one per session with at
 * least one answered station (Leo 2026-08-14 revision to spec 042 §5, replacing the old
 * exit-record chat message). */
export function focusBadgeLine(rootLabel: string, stationCount: number): string {
  return `🔎 探索过：${rootLabel} · ${stationCount} 站`;
}

/** Top-of-chat collapsible bar's folded title — sessionCount counts only sessions with at
 * least one answered station (Leo 2026-08-14 revision to spec 042 §5). */
export function focusBarTitle(sessionCount: number): string {
  return `🔎 本对话的专注探索（${sessionCount}）`;
}
