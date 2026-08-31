/**
 * Purpose: offline token estimation, for costing a call before it is made (the billing
 * page's per-feature estimates) and for measuring a prompt's size without spending money.
 *
 * The ratios are DeepSeek's own published ones: "1 English character ≈ 0.3 token,
 * 1 Chinese character ≈ 0.6 token" (https://api-docs.deepseek.com/quick_start/token_usage,
 * read 2026-08-31). Their documentation is explicit that these are approximations and that
 * the usage figures returned by the API are the authoritative count — so this is only ever
 * used for estimates shown as estimates, never to bill anybody.
 *
 * Main exports: estimateTokens, estimateMessageTokens.
 */

/** Characters written in a CJK script, which the ratios treat differently from latin text. */
const CJK_PATTERN = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

const TOKENS_PER_CJK_CHARACTER = 0.6;
const TOKENS_PER_OTHER_CHARACTER = 0.3;

/** Approximate token count for one string, rounded up — a fractional token still costs a
 * whole one, and rounding down would let an estimate read cheaper than reality. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (CJK_PATTERN.test(character)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * TOKENS_PER_CJK_CHARACTER + other * TOKENS_PER_OTHER_CHARACTER);
}

/** Per-message overhead the chat wire format adds around the content (role, delimiters).
 * Four tokens per message is the long-standing OpenAI-format rule of thumb; it is small
 * enough not to move an estimate much and large enough not to under-count. */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/** Approximate prompt tokens for a whole message list, as it would be sent. */
export function estimateMessageTokens(
  messages: readonly { role: string; content: string }[],
): number {
  return messages.reduce(
    (total, message) =>
      total +
      PER_MESSAGE_OVERHEAD_TOKENS +
      estimateTokens(message.role) +
      estimateTokens(message.content),
    0,
  );
}
