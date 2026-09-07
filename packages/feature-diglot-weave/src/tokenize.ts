/**
 * Purpose: language-agnostic message tokenization for the weave pipeline —
 * ICU word segmentation via Intl.Segmenter plus clause indexing for the dispersion rule.
 * Main exports: tokenizeMessage, clauseTextOf, WordToken, countWordLikeTokens.
 */

export interface WordToken {
  /** The exact surface text of the segment. */
  text: string;
  /** Character offset of the segment start in the original message. */
  start: number;
  /** Character offset one past the segment end. */
  end: number;
  /** True for segments ICU considers words (skips spaces and punctuation). */
  isWordLike: boolean;
  /** 0-based clause index; clause-ending punctuation starts a new clause. The dispersion
   * constraint allows at most one replacement per clause. */
  clauseIndex: number;
}

/**
 * Punctuation that ends a clause, across every script the app ships an interface in.
 *
 * Every script belongs here: a list of only Latin and CJK marks leaves a message in Hindi,
 * Bengali or Arabic with exactly ZERO clause boundaries, since none of those languages ends a
 * sentence with any of those characters. The dispersion rule allows at most one replacement
 * per clause, so those readers would get one woven word per message however long it was,
 * while a Chinese or English reader of the same message gets one per sentence.
 */
const CLAUSE_BREAKERS = new Set([
  // Latin
  ",",
  ".",
  ";",
  ":",
  "!",
  "?",
  "…",
  "\n",
  // CJK full-width
  "，",
  "。",
  "、",
  "；",
  "：",
  "！",
  "？",
  // Arabic / Persian / Urdu
  "،",
  "؛",
  "؟",
  "۔",
  // Devanagari and the other Indic scripts that share the danda (Bengali included)
  "।",
  "॥",
  // Ethiopic (Amharic)
  "፣",
  "፤",
  "፥",
  "።",
]);

/** Segments a message into word tokens with clause indexes. `sourceLang` is a BCP-47 tag
 * (e.g. "zh", "en") — ICU picks the right dictionary for space-free scripts. */
export function tokenizeMessage(message: string, sourceLang: string): WordToken[] {
  const segmenter = new Intl.Segmenter(sourceLang, { granularity: "word" });
  const tokens: WordToken[] = [];
  let clauseIndex = 0;
  for (const segment of segmenter.segment(message)) {
    tokens.push({
      text: segment.segment,
      start: segment.index,
      end: segment.index + segment.segment.length,
      isWordLike: segment.isWordLike === true,
      clauseIndex,
    });
    if (!segment.isWordLike) {
      for (const char of segment.segment) {
        if (CLAUSE_BREAKERS.has(char)) {
          clauseIndex += 1;
          break;
        }
      }
    }
  }
  return tokens;
}

/**
 * The text of one clause, as the reader sees it. This is the "context" a word was met in.
 * It must stay the clause and not the whole message: with the message standing in, two words
 * in the same long reply look like they met identical contexts, which makes every novelty
 * score coarser.
 */
export function clauseTextOf(
  message: string,
  tokens: readonly WordToken[],
  clauseIndex: number,
): string {
  const inClause = tokens.filter((token) => token.clauseIndex === clauseIndex);
  const first = inClause[0];
  const last = inClause.at(-1);
  if (first === undefined || last === undefined) return "";
  return message.slice(first.start, last.end).trim();
}

/** The message's word count — the denominator of the density budget. */
export function countWordLikeTokens(tokens: readonly WordToken[]): number {
  return tokens.reduce((count, token) => count + (token.isWordLike ? 1 : 0), 0);
}
