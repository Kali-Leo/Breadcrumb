/**
 * Purpose: how long a piece of text takes to read (spec 054 §(d)), so a card can say "约 8 分钟"
 * where a video would say what it is. Kept out of the card so the arithmetic can be checked
 * without a DOM.
 *
 * The two speeds are deliberately unhurried round numbers rather than a measured figure: published
 * adult silent-reading rates sit above both, so the estimate runs long. That direction is the safe
 * one — someone who set aside more time than they needed is never let down, someone who set aside
 * less is. They are our own numbers, not a figure copied from a product or a paper.
 *
 * Nothing is estimated from a teaser. A card's `hook` is a clipped summary of at most a few dozen
 * characters, and timing that would produce a confident-looking number about a text we have never
 * seen; only the article text we actually hold is counted, and when we hold too little the card
 * says what kind of thing it is instead of inventing a number.
 * Main exports: CHINESE_CHARACTERS_PER_MINUTE, WESTERN_WORDS_PER_MINUTE,
 * MINIMUM_CHARACTERS_TO_ESTIMATE, estimateReadingMinutes.
 */

export const CHINESE_CHARACTERS_PER_MINUTE = 300;
export const WESTERN_WORDS_PER_MINUTE = 200;

/** Below this much text there is no article here — a stub, a paywall notice, or an extraction that
 * came back nearly empty. About forty seconds of Chinese reading. */
export const MINIMUM_CHARACTERS_TO_ESTIMATE = 200;

/** Han characters plus the kana that show up in Japanese sources; each one is a unit of reading. */
const CHINESE_CHARACTER = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/** A run of letters or digits, which is how the western half of a text is counted. */
const WESTERN_WORD = /[0-9A-Za-zÀ-ɏ]+/g;

/**
 * Strips the parts of a markdown body nobody reads: code blocks, picture markup, link addresses
 * (the words of a link stay, the address goes) and the syntax characters themselves. Counting a
 * long address as reading would add minutes to a short article.
 */
function readableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`~|]+/g, " ")
    .trim();
}

/**
 * Whole minutes, or null when there is not enough text to say anything honest. Never zero: a text
 * long enough to be counted at all takes at least a minute to sit down with.
 */
export function estimateReadingMinutes(markdown: string | null): number | null {
  if (markdown === null) return null;
  const text = readableText(markdown);
  if (text.length < MINIMUM_CHARACTERS_TO_ESTIMATE) return null;

  const chineseCharacters = text.match(CHINESE_CHARACTER)?.length ?? 0;
  const westernWords = text.match(WESTERN_WORD)?.length ?? 0;
  const minutes =
    chineseCharacters / CHINESE_CHARACTERS_PER_MINUTE + westernWords / WESTERN_WORDS_PER_MINUTE;
  if (minutes <= 0) return null;
  return Math.max(1, Math.round(minutes));
}
