/**
 * Purpose: zero-LLM heuristic for "this user message signals confusion" — the trigger for
 * the same-round downshift line (spec 038 §2.3). Pattern-based v1; repeated-question
 * similarity detection is deliberately out of scope until real transcripts justify it.
 * Main exports: detectConfusion.
 */

/** Phrases a learner uses when an explanation did not land. Kept short on purpose:
 * false negatives are cheap (no downshift), false positives patronize. */
const CONFUSION_PATTERNS: readonly RegExp[] = [
  /没(有)?听懂/,
  /听不懂/,
  /没(有)?看懂/,
  /看不懂/,
  /不太?懂/,
  /没(有)?懂/,
  /不太?明白/,
  /没(有)?明白/,
  /不太?理解/,
  /没(有)?理解/,
  /还是不(会|行|对)/,
  /什么意思/,
  /啥意思/,
  /再讲一(遍|次)/,
  /换(个|种)(方式|说法|讲法)/,
  /越(听|看)越(糊涂|懵)/,
  /(好|太)(绕|抽象)了/,
  /懵了?$/,
];

/** True when the message reads as "I did not get that". Questions that merely contain
 * 「懂」等 substrings in other senses stay untriggered because patterns anchor on the
 * negated forms. */
export function detectConfusion(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) return false;
  return CONFUSION_PATTERNS.some((pattern) => pattern.test(trimmed));
}
