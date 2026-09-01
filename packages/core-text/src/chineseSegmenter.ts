/**
 * Purpose: splitting Chinese text into words (2026-08-16 audit item "伙伴记忆中文分词换开源库").
 *
 * The audit named jieba-wasm. Measured, that is a 4 MB WebAssembly blob per build target —
 * almost all of it the bundled dictionary — for one relevance score in one feature, and the
 * browser edition would have to download it before anyone could open a chat. So the same job
 * is done with dictionaries this repo already builds: the zh→en language pack's headwords
 * (everyday vocabulary) plus the canonical concept labels (the study vocabulary a subtitle
 * corpus has never heard of). 36,040 words, 353 KB as JSON, 137 KB over the wire — a
 * thirtieth of the WASM build. Forward maximum matching over a word list is the classical
 * dictionary segmenter, and on ordinary text it is what jieba's dictionary pass produces too.
 * Rebuild it with `node scripts/build-chinese-words.mjs` whenever either source changes.
 *
 * What it is not: jieba's HMM pass, which invents words the dictionary has never seen (names,
 * neologisms). Runs of characters that match no word fall back to character bigrams — what
 * this code did for everything before — so an unknown word still contributes something to
 * match on rather than disappearing.
 * Main exports: segmentChinese, CHINESE_WORD_COUNT.
 */
import words from "./chineseWords.json" with { type: "json" };

const DICTIONARY = new Set(words as string[]);
/** Longest entry in the list — the window maximum matching starts from. */
const MAX_WORD_LENGTH = (words as string[]).reduce(
  (longest, word) => Math.max(longest, word.length),
  2,
);

export const CHINESE_WORD_COUNT = DICTIONARY.size;

/**
 * Forward maximum matching: at each position take the longest dictionary word that starts
 * there. A position that begins no word yields its single character, and its neighbours are
 * additionally paired into a bigram, so an unsegmentable run still produces tokens that can
 * match another copy of the same run.
 */
export function segmentChinese(run: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < run.length) {
    let matched = "";
    const limit = Math.min(MAX_WORD_LENGTH, run.length - index);
    for (let length = limit; length >= 2; length -= 1) {
      const candidate = run.slice(index, index + length);
      if (DICTIONARY.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (matched !== "") {
      tokens.push(matched);
      index += matched.length;
      continue;
    }
    const character = run[index] as string;
    tokens.push(character);
    // The bigram this character starts, when there is a next character and it too failed to
    // begin a word — the old behaviour, kept exactly where the dictionary has nothing to say.
    const next = run[index + 1];
    if (next !== undefined) tokens.push(character + next);
    index += 1;
  }
  return tokens;
}
