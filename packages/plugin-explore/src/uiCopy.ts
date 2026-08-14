/**
 * Purpose: every user-visible string of explore doors and the selection quote bar in one
 * place (spec 039 §2.2, §2.3) — plain statements only (product principle 1: no praise, no
 * performed warmth); simlab scans this module against the pressure lexicon.
 * Main exports: EXPLORE_UI_COPY, conceptDirectRevealLine, doorExpandPrefill,
 * selectionExplainPrefill, selectionDiscussPrefill.
 */

/** Static UI strings (door card, selection bar). Keys exist so the simlab scan can name a hit. */
export const EXPLORE_UI_COPY = {
  doorGuessPrompt: "先猜猜：一句话说它是什么？",
  doorGuessPlaceholder: "你的猜测",
  doorGuessSubmit: "提交",
  doorExpandButton: "展开聊聊",
  selectionExplainButton: "解释一下",
  selectionDiscussButton: "展开聊聊",
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
