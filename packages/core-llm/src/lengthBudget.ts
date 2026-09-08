/**
 * Purpose: how a prompt tells a model to keep an answer short without assuming the answer is
 * written in Chinese. "40 字以内" counts hanzi; in a language written with words it means
 * nothing, so the model ignored it and the reply overshot the schema's character cap — the
 * 2026-09-08 bench measured trail-summary at 100% in zh-CN against 33% in en/fr, and
 * map-naming at 96% against 0% in fr/ru/bn/sw, every failure a too_big on the length bound.
 *
 * A budget is therefore stated for both script families at once: the model knows which
 * language the answer-language directive told it to write in, and applies the clause that
 * fits. The schema's hard ceiling is derived from the same budget so the sentence the prompt
 * asks for and the string the schema accepts cannot drift apart.
 * Main exports: LengthBudget, lengthRule, maxCharsFor.
 */

export interface LengthBudget {
  /** Characters, for a language written in hanzi / kana / hangul. */
  cjkChars: number;
  /** Words, for every other language. */
  words: number;
}

/**
 * Characters one word costs at the wide end, its trailing space included. Measured off the
 * demo learner — the same concept labels and one-line summaries written by hand in all
 * eleven interface languages — where Bengali, Hindi and Swahili run 7-11 characters per
 * word. The ceiling is deliberately the wide end: a schema that cuts a correct reply short
 * costs a retry and then a silent feature outage, while one that lets a long reply through
 * costs a slightly long label.
 */
const CHARS_PER_WORD = 12;

/**
 * The clause a prompt drops into its length requirement. Authored in Chinese like every
 * other prompt in this repository — only the answer-language directive (core-i18n's
 * buildLanguageDirective) ever names the language the answer is written in.
 */
export function lengthRule(budget: LengthBudget): string {
  return `中文/日文/韩文不超过 ${budget.cjkChars} 个字，其他语言不超过 ${budget.words} 个词`;
}

/**
 * The hard ceiling the Zod field should carry for this budget: wide enough that the
 * longest-running script can say the same thing, tight enough that a paragraph dropped into
 * a one-sentence field is still rejected. Loosening a bound is not dropping it.
 */
export function maxCharsFor(budget: LengthBudget): number {
  return Math.max(budget.cjkChars, budget.words * CHARS_PER_WORD);
}
