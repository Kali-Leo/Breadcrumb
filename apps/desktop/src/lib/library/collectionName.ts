/**
 * Purpose: the name a collection is given when it is saved on its own — no model, a rule.
 *
 * Two books called 「高等数学上册」 and 「高等数学下册」 are a collection called 「高等数学」: the
 * part of the titles they share is what the reader would call the set. When the titles share
 * nothing worth saying, the name lists them — the first two, and how many more — so a
 * collection is never called something that describes none of its members.
 *
 * The shared prefix is cut on a word boundary for scripts that have them ("Intro" out of
 * "Introduction" and "Intro to X" names neither book), and trailing separators, numbers and
 * volume words are trimmed, so "Chapter 1"/"Chapter 2" gives "Chapter", not "Chapter ".
 * Main exports: sharedTitlePrefix, autoCollectionName, NameFallback.
 */

/** Ideographic, kana and hangul: scripts written without spaces, where every character is a
 * boundary of its own. */
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** What a shared prefix may not end on: separators, brackets, digits, and the words that
 * number the volumes of one work. */
const TRAILING = /(?:[\s\p{P}\p{S}\d]|第|卷|册|篇|部|上|下|中|vol|volume|part)+$/iu;
/** A prefix shorter than this names nothing — one character is a coincidence. */
const MIN_PREFIX_LENGTH = 2;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char) && !NO_SPACE_SCRIPT.test(char);
}

/** The longest run of characters every title starts with, cut back to a word boundary and
 * stripped of what a name may not end on. Empty when the titles share nothing usable. */
export function sharedTitlePrefix(titles: readonly string[]): string {
  const first = titles[0];
  if (first === undefined || titles.length < 2) return "";
  const chars = [...first];
  let length = chars.length;
  for (const title of titles.slice(1)) {
    const other = [...title];
    let index = 0;
    while (index < length && index < other.length && chars[index] === other[index]) index += 1;
    length = index;
  }
  // "Introduction to X" / "Intro to Y" share "Intro", which is not a word in either title.
  if (isWordChar(chars[length - 1]) && titles.some((title) => isWordChar([...title][length]))) {
    while (length > 0 && isWordChar(chars[length - 1])) length -= 1;
  }
  const prefix = chars.slice(0, length).join("").replace(TRAILING, "");
  return [...prefix].length >= MIN_PREFIX_LENGTH ? prefix : "";
}

/** The two sentences the fallback needs from the catalogue, in the interface's language. */
export interface NameFallback {
  /** Joins two titles: 「A、B」. */
  pair(first: string, second: string): string;
  /** Two titles and how many members there are in all: 「A、B 等 3 份」. */
  more(first: string, second: string, count: number): string;
}

export function autoCollectionName(titles: readonly string[], fallback: NameFallback): string {
  const prefix = sharedTitlePrefix(titles);
  if (prefix !== "") return prefix;
  const [first = "", second = ""] = titles;
  if (titles.length <= 1) return first;
  if (titles.length === 2) return fallback.pair(first, second);
  return fallback.more(first, second, titles.length);
}
