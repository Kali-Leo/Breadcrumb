/**
 * Purpose: deterministic tripwire for the teaching contract v2's two hard discipline rules —
 * "one question per turn" and "brevity" (spec 038 §2.6, contract text in
 * packages/core-teaching/src/contract.ts: "一次回复只推进一步，能短则短；一次最多问一个问题").
 * Main exports: countQuestions, checkTeachingDiscipline, TeachingDisciplineResult.
 */

/** Reply length above which a tutor turn is flagged as overlong, unless overridden. */
const DEFAULT_MAX_CHARS = 1200;

export interface TeachingDisciplineResult {
  totalReplies: number;
  multiQuestionReplies: number;
  overlongReplies: number;
}

/** Counts question marks in `text`, treating any run of consecutive '？'/'?' characters
 * (e.g. "？？", or the '?' in "?!") as a single question mark rather than one per glyph —
 * a rapid-fire "？？？" is still one rhetorical question, not three. */
export function countQuestions(text: string): number {
  return (text.match(/[？?]+/g) ?? []).length;
}

/** Scans already-produced tutor replies for the two contract-v2 discipline rules: at most
 * one question per reply, and staying under `maxChars` (default 1200). Pure aggregation, no
 * judgment about content — a reply either trips a rule or it doesn't. */
export function checkTeachingDiscipline(
  replies: readonly string[],
  options?: { maxChars?: number },
): TeachingDisciplineResult {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  let multiQuestionReplies = 0;
  let overlongReplies = 0;
  for (const reply of replies) {
    if (countQuestions(reply) > 1) multiQuestionReplies += 1;
    if (reply.length > maxChars) overlongReplies += 1;
  }
  return { totalReplies: replies.length, multiQuestionReplies, overlongReplies };
}
