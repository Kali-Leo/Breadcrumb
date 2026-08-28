/**
 * Purpose: zero-LLM heuristic for "this user message signals confusion" — the trigger for
 * the same-round downshift line (spec 038 §2.3). Pattern-based v1; repeated-question
 * similarity detection is deliberately out of scope until real transcripts justify it.
 * Main exports: detectConfusion.
 */

/** Phrases a learner uses when an explanation did not land. Kept short on purpose:
 * false negatives are cheap (no downshift), false positives patronize. */
const CHINESE_CONFUSION_PATTERNS: readonly RegExp[] = [
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

/** The same job in English — an English-writing learner was previously unreachable by the
 * downshift entirely. Same bias, enforced differently: English negations attach to a verb
 * that has plenty of innocent objects, so each pattern demands either an explicit object
 * ("don't get *it*") or the end of the message. That keeps "I don't get paid for this" and
 * "I'm not following the tutorial" quiet at the cost of missing some real confusion. */
const ENGLISH_CONFUSION_PATTERNS: readonly RegExp[] = [
  /\b(?:don'?t|do not|didn'?t|did not|can'?t|cannot)\s+(?:get|follow|understand)\s+(?:it|this|that|you|any of)\b/i,
  /\bi\s+(?:really\s+|still\s+|just\s+)?(?:don'?t|do not|didn'?t|did not)\s+(?:get|follow|understand)\s*[.!?]*$/i,
  /\b(?:i'?m|i am)\s+(?:(?:so|really|totally|very|still|quite|pretty|super|a\s+bit|kinda|kind\s+of)\s+)?confused\b/i,
  /\b(?:still|even\s+more|more)\s+confused\b/i,
  /\b(?:i'?m|i am)\s+lost\b/i,
  /\b(?:you\s+)?lost\s+me\b/i,
  /\b(?:i'?m|i am)\s+not\s+following\s*(?:you|this|that|it)?\s*[.!?]*$/i,
  /\bmakes\s+no\s+sense\b/i,
  /\bdoesn'?t\s+make\s+(?:any\s+)?sense\b/i,
  /\bwhat\s+do\s+you\s+mean\b/i,
  /\bwhat\s+does\s+(?:that|this|it)\s+mean\b/i,
  /\bno\s+idea\s+what\s+(?:you|that|this)\b/i,
  /\b(?:say|explain|go\s+over)\s+(?:that|this|it)\s+again\b/i,
  /\bexplain\s+(?:that|this|it)\s+(?:differently|another\s+way|in\s+another\s+way)\b/i,
  /\b(?:in\s+)?simpler\s+terms\b/i,
  /\bdumb\s+it\s+down\b/i,
  /\btoo\s+abstract\b/i,
];

/** Both language tables are checked on every message: one learner can switch languages
 * mid-conversation, and the patterns cannot collide across scripts. */
const CONFUSION_PATTERNS: readonly RegExp[] = [
  ...CHINESE_CONFUSION_PATTERNS,
  ...ENGLISH_CONFUSION_PATTERNS,
];

/** True when the message reads as "I did not get that". Questions that merely contain
 * 「懂」等 substrings in other senses stay untriggered because patterns anchor on the
 * negated forms. */
export function detectConfusion(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) return false;
  return CONFUSION_PATTERNS.some((pattern) => pattern.test(trimmed));
}
