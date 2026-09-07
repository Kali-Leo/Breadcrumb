/**
 * Purpose: the word-cloud panel's data — the words that keep appearing in what the learner
 * browsed, each with how often and how positive it reads. A word is counted once per title, so
 * the cloud shows how many *things* were about a word, not how many times a title repeated it.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:326-346` — `_STOP` and
 * `wordcloud`), GPL-3.0, same copyright holder; modified 2026-09-07 (Python → TypeScript; jieba
 * replaced by this repo's own `segmentChinese`, which is dictionary forward-maximum-matching
 * over the 36,040 words core-text already ships — no 4 MB WebAssembly download for one panel).
 *
 * Segmentation differs from jieba's: jieba additionally guesses unseen words with an HMM pass,
 * which this does not. The visible effect is that a neologism or a name splits into shorter
 * dictionary words instead of appearing whole.
 * Main exports: wordCloudWords, WORD_CLOUD_LIMIT.
 */
import { segmentChinese } from "@breadcrumb/core-text";
import wordValence from "../data/wordValence.json" with { type: "json" };
import type { BrowsingEventRow } from "../events";
import type { WordCloud } from "../schemas";

/** How many words the cloud carries. app.py:344. */
export const WORD_CLOUD_LIMIT = 80;
const SECONDS_PER_DAY = 86400;

/** app.py:326 verbatim. Function words and the two ways the source calls a video's author. */
const STOP_WORDS = new Set(
  `的 了 我 你 他 她 它 是 在 有 和 与 就 都 也 又 还 这 那 什么 怎么 为什么 一个 我们 你们
   他们 自己 没有 不是 可以 这个 那个 到底 竟然 居然 直接 真的 如何 这样 那样 但是 因为 所以
   如果 已经 现在 开始 最后 第一 第二 up 主 UP`.split(/\s+/),
);

const VALENCE_BY_WORD = wordValence as Readonly<Record<string, number>>;

const CJK = /\p{Script=Han}/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}\p{M}]/u;

/**
 * Words of one title. Han runs go through the dictionary segmenter; everything else is kept as
 * a run so it can be counted and then dropped by the same rule the reference used.
 */
export function titleWords(title: string): string[] {
  const words: string[] = [];
  let han = "";
  let other = "";
  const flushHan = (): void => {
    if (han !== "") words.push(...segmentChinese(han));
    han = "";
  };
  const flushOther = (): void => {
    if (other !== "") words.push(other);
    other = "";
  };
  for (const char of title) {
    if (CJK.test(char)) {
      flushOther();
      han += char;
    } else if (LETTER_OR_NUMBER.test(char)) {
      flushHan();
      other += char;
    } else {
      flushHan();
      flushOther();
    }
  }
  flushHan();
  flushOther();
  return words;
}

/**
 * The reference drops any word made entirely of digits, ASCII letters, underscores and
 * punctuation (`app.py:341`). Written out rather than transliterated: JavaScript's `\W` is
 * ASCII-only, so the literal regex would have thrown away every Chinese word.
 */
function isMeaningful(word: string): boolean {
  const characters = Array.from(word);
  if (characters.length < 2 || STOP_WORDS.has(word)) return false;
  return characters.some(
    (char) => LETTER_OR_NUMBER.test(char) && (char.codePointAt(0) ?? 0) > 0x7f,
  );
}

export interface WordCloudOptions {
  readonly days: number;
  /** "engage": clicks and watches. Anything else: exposures — what the feed showed. */
  readonly source: string;
  readonly now: number;
}

/**
 * Colour comes from the shipped lexicon first, and only falls back to the average valence of
 * the titles the word appeared in — a per-learner average over a handful of titles is a much
 * weaker number than a lexicon entry, and would otherwise quietly outrank it.
 */
export function wordCloudWords(
  rows: readonly BrowsingEventRow[],
  options: WordCloudOptions,
): WordCloud {
  const since = options.now - options.days * SECONDS_PER_DAY;
  const wantEngaged = options.source === "engage";
  const counts = new Map<string, number>();
  const valences = new Map<string, number[]>();
  for (const row of rows) {
    if (row.ts < since || (row.etype !== "expose") !== wantEngaged) continue;
    for (const word of new Set(titleWords(row.title))) {
      if (!isMeaningful(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
      if (row.valence !== null) {
        const seen = valences.get(word);
        if (seen === undefined) valences.set(word, [row.valence]);
        else seen.push(row.valence);
      }
    }
  }
  const words = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WORD_CLOUD_LIMIT)
    .map(([word, n]) => ({ w: word, n, valence: valenceOf(word, valences.get(word)) }));
  return { days: options.days, source: options.source, words };
}

function valenceOf(word: string, observed: readonly number[] | undefined): number {
  const known = VALENCE_BY_WORD[word];
  if (known !== undefined) return Math.round(known * 100) / 100;
  if (observed === undefined || observed.length === 0) return 0;
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  return Math.round(mean * 100) / 100;
}
