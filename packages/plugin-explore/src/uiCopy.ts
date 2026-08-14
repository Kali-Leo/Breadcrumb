/**
 * Purpose: every user-visible string of explore doors, the selection quote bar, the station
 * map, and the sidebar's trail cards/groups/transfer list (spec 039 §2.2, §2.3; spec 040 §3;
 * spec 041) in one place — plain statements only (product principle 1: no praise, no performed
 * warmth); simlab scans this module against the pressure lexicon.
 * Main exports: EXPLORE_UI_COPY, conceptDirectRevealLine, doorExpandPrefill,
 * selectionExplainPrefill, selectionDiscussPrefill, frontierStopPrefill, transferListTitle.
 */

/** Static UI strings (door card, selection bar, station map, sidebar trail cards). Keys exist
 * so the simlab scan can name a hit. */
export const EXPLORE_UI_COPY = {
  doorGuessPrompt: "先猜猜：一句话说它是什么？",
  doorGuessPlaceholder: "你的猜测",
  doorGuessSubmit: "提交",
  doorExpandButton: "展开聊聊",
  selectionExplainButton: "解释一下",
  selectionDiscussButton: "展开聊聊",
  stationMapEmptyLine: "这条线还没有站点。",
  stationResumeButton: "续",
  /** Anchors a station's node so following rounds revolve around it (spec 040). */
  stationAnchorButton: "锚",
  atlasEntryButton: "收线 · 文字详单",
  /** Sidebar "正在进行" section header (spec 041 §2) — today's active trails, a preview. */
  ongoingSectionLabel: "正在进行",
  /** Group label for trails with no dominant knowledge node (spec 041 §2). */
  casualChatGroupLabel: "随手聊",
  /** Bottom-of-sidebar toggle into the flat, time-ordered trail list (spec 041 §2). */
  timelineToggleLabel: "按时间浏览",
  /** Collapses the timeline view back to the grouped one. */
  timelineCollapseLabel: "收起",
  /** Marks a transfer station's other-trail listing entry point (spec 041 §3). */
  transferBadge: "换乘",
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

/** Composer prefill for the selection bar's "解释一下" action. */
export function selectionExplainPrefill(quotedText: string): string {
  return `解释一下「${quotedText}」`;
}

/** Composer prefill for the selection bar's "展开聊聊" action. */
export function selectionDiscussPrefill(quotedText: string): string {
  return `「${quotedText}」这里我想再聊聊：`;
}

/** Composer prefill for clicking an unvisited station map frontier stop (spec 040 §3). */
export function frontierStopPrefill(label: string): string {
  return `想聊聊「${label}」`;
}

/** Header line for a transfer station's other-trail popover (spec 041 §3) — states the fact
 * plainly, no framing about "重逢"/"惊喜" (product principle 1). */
export function transferListTitle(nodeLabel: string): string {
  return `「${nodeLabel}」也在别的对话出现过`;
}
