/**
 * Purpose: tells which language a card's own words are in (spec 054, Leo's second point), so a
 * feed set to 中文 does not show a Japanese picture caption that arrived through a Chinese
 * channel. A source's declared language only describes the channel, not every item it publishes —
 * 维基百科每日精选 carries Commons captions written in whatever language their author used.
 * Entirely arithmetic and entirely local: no model file, no network, no LLM. Deliberately
 * conservative — anything it cannot read confidently comes back null, and a null is kept.
 * Main exports: detectTextLanguage, DetectedTextLanguage.
 */

/**
 * What one piece of text is written in, at the coarseness this is honest about. Latin script is
 * reported as "english" whatever European language it actually is: nothing here can tell English
 * from French, and the shipped catalog publishes no other Latin-script language, so the
 * distinction would be unused precision. "other" is a non-Latin, non-CJK script (Cyrillic, Greek,
 * Arabic and friends).
 */
export type DetectedTextLanguage = "chinese" | "english" | "japanese" | "korean" | "other";

const HAN_CHARACTER = /\p{Script=Han}/u;
const KANA_CHARACTER = /\p{Script=Hiragana}|\p{Script=Katakana}/u;
const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const OTHER_SCRIPT_CHARACTER =
  /\p{Script=Cyrillic}|\p{Script=Greek}|\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Thai}|\p{Script=Devanagari}|\p{Script=Armenian}|\p{Script=Georgian}/u;

/** Addresses are Latin letters that say nothing about the language of the sentence around them,
 * and feed summaries are full of them. */
const WEB_ADDRESS = /https?:\/\/\S+|www\.\S+/gi;

interface ScriptCounts {
  han: number;
  kana: number;
  hangul: number;
  latinWords: number;
  otherScript: number;
}

/**
 * One Han character carries about as much of a sentence as one Latin word does, so Han characters
 * are counted one by one and Latin letters are counted in runs. Counting letters instead would
 * make every English sentence look five times longer than the Chinese one beside it.
 */
function countScripts(text: string): ScriptCounts {
  const counts: ScriptCounts = { han: 0, kana: 0, hangul: 0, latinWords: 0, otherScript: 0 };
  let insideLatinWord = false;
  for (const character of text) {
    if (LATIN_LETTER.test(character)) {
      if (!insideLatinWord) counts.latinWords += 1;
      insideLatinWord = true;
      continue;
    }
    insideLatinWord = false;
    if (HAN_CHARACTER.test(character)) counts.han += 1;
    else if (KANA_CHARACTER.test(character)) counts.kana += 1;
    else if (HANGUL_CHARACTER.test(character)) counts.hangul += 1;
    else if (OTHER_SCRIPT_CHARACTER.test(character)) counts.otherScript += 1;
  }
  return counts;
}

/**
 * Below this much readable material the text is a name, a headline fragment or a row of emoji,
 * and any verdict on it would be a coin toss. Six units is roughly six Chinese characters or six
 * English words — short enough that ordinary titles clear it, long enough that "Hacker News" and
 * "维基百科" do not.
 */
const MINIMUM_SIGNAL = 6;

/** Japanese and Korean announce themselves with their own syllabaries. Four characters of one is
 * far past anything a Chinese or English sentence borrows in passing. */
const SYLLABARY_MINIMUM = 4;

/** How much of the Han-plus-Latin material has to be Han before the text is read as Chinese, and
 * how little before it is read as English. Between the two the text is genuinely mixed — a
 * Chinese article about an English-named product, an English article quoting a Chinese phrase —
 * and mixed comes back null, which keeps the card. */
const CHINESE_SHARE = 0.6;
const ENGLISH_SHARE = 0.25;

/**
 * The language of the given text, or null when the text does not say clearly enough. Null is the
 * answer for short text, for punctuation and emoji, and for text that is genuinely half one
 * language and half the other; every caller treats null as "keep it", because dropping something
 * worth reading costs the reader more than an occasional stray does.
 */
export function detectTextLanguage(text: string): DetectedTextLanguage | null {
  const readable = text.replace(WEB_ADDRESS, " ");
  const counts = countScripts(readable);
  const signal = counts.han + counts.kana + counts.hangul + counts.latinWords + counts.otherScript;
  if (signal < MINIMUM_SIGNAL) return null;

  if (counts.hangul >= SYLLABARY_MINIMUM) return "korean";
  // Japanese written in kanji alone is indistinguishable from Chinese by script, and comes back
  // "chinese". Kana appears in almost every real Japanese sentence, so the miss is rare and it is
  // the harmless direction: an occasional Japanese headline in a Chinese feed, not the reverse.
  if (counts.kana >= SYLLABARY_MINIMUM) return "japanese";
  if (
    counts.otherScript >= SYLLABARY_MINIMUM &&
    counts.otherScript >= counts.han &&
    counts.otherScript >= counts.latinWords
  ) {
    return "other";
  }

  const latinAndHan = counts.han + counts.latinWords;
  if (latinAndHan === 0) return null;
  const hanShare = counts.han / latinAndHan;
  if (hanShare >= CHINESE_SHARE) return "chinese";
  if (hanShare <= ENGLISH_SHARE) return "english";
  return null;
}
