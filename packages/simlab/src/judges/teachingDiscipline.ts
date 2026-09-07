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

/**
 * Counts question marks in `text`, treating any run of consecutive question marks (e.g.
 * "？？", or the '?' in "?!") as a single question rather than one per glyph — a rapid-fire
 * "？？？" is still one rhetorical question, not three.
 *
 * The class covers every question mark the shipped languages use, not just the ASCII and
 * full-width ones. Arabic writes '؟' (U+061F): until 2026-09-07 an Arabic tutor turn asking
 * four questions counted zero, so the "one question per turn" rule — a hard rule of the
 * teaching contract — was simply not enforced for Arabic readers, and no run could have
 * revealed it because no persona wrote Arabic.
 */
const QUESTION_MARKS = /[?？؟՞፧⁇⁈⁉]+/g;

export function countQuestions(text: string): number {
  return (text.match(QUESTION_MARKS) ?? []).length;
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
