/**
 * Purpose: turn a passage or a question into the exact same tokens on both sides of the
 * keyword index, so that what was written is what can be found.
 *
 * The product analyses text itself and stores the result, rather than handing raw prose to
 * SQLite and hoping its tokenizer agrees with ours. That buys three things measured in
 * docs/research/2026-09-12-检索与重排-大规模实测.md §4 and unavailable from `unicode61` alone:
 *
 *  - Chinese as overlapping character bigrams. On the 4.9M-passage MIRACL corpus this beats
 *    the product's own dictionary segmenter by 42% relative (nDCG@10 0.136 vs 0.096) and ties
 *    it on colloquial web text, because a 36k-word everyday vocabulary has never met the
 *    proper nouns and technical terms an uploaded book is full of.
 *  - Devanagari and Bengali kept whole — see tokenChars.ts, which is the load-bearing half.
 *  - Snowball stemming, which is worth +0.088 nDCG@10 on Russian and +0.039 on Arabic and
 *    which SQLite does not do at all.
 *
 * Stems go in their own field rather than replacing the word, and only when they differ. A
 * shadow field means an exact word still matches as an exact word (no double counting, since
 * an unchanged stem is not written twice), and a document whose language was guessed wrongly
 * degrades to "found by its literal words" instead of to "not found".
 * Main exports: analyze, analyzedFields, matchExpression, fold, stemLanguageFor, Analyzed, Stem.
 */
import { tokenPattern } from "./tokenChars";

/** The Snowball algorithms this product uses, named as the library names them. Indonesian and
 * Hindi have Snowball algorithms upstream but not in the port we ship; they fall through to
 * no stemming, which is where they were before, not a regression. */
export type StemLanguage = "arabic" | "english" | "french" | "portuguese" | "russian" | "spanish";

export type Stem = (word: string, language: StemLanguage) => string;

export interface AnalyzeOptions {
  /** BCP-47 code of the text's language, used only to pick a stemmer for Latin script — every
   * other script identifies its own language uniquely among the eleven this app speaks. */
  language?: string;
  stem?: Stem;
}

export interface Analyzed {
  /** In document order, repeats included: term frequency is what BM25 is made of. */
  tokens: string[];
  /** Only where the stem differs from the token, aligned to nothing — a bag, not a mapping. */
  stems: string[];
}

const LATIN_STEMMERS: Readonly<Record<string, StemLanguage>> = {
  en: "english",
  es: "spanish",
  fr: "french",
  pt: "portuguese",
};

const HAN = /\p{Script=Han}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /\p{Script=Latin}/u;

/** Which Snowball algorithm, if any, applies to this token. Script decides it wherever script
 * can — a Cyrillic word in an English document is still Russian — and the document's declared
 * language decides it only for Latin, where script says nothing. */
export function stemLanguageFor(token: string, language: string | undefined): StemLanguage | null {
  if (CYRILLIC.test(token)) return "russian";
  if (ARABIC.test(token)) return "arabic";
  if (!LATIN.test(token)) return null;
  const base = (language ?? "").split("-")[0] ?? "";
  return LATIN_STEMMERS[base] ?? null;
}

/** Overlapping character bigrams, the CJKAnalyzer rule: a lone character stands as itself. */
function hanBigrams(run: string): string[] {
  const characters = [...run];
  if (characters.length < 2) return characters;
  return characters.slice(0, -1).map((character, index) => character + characters[index + 1]);
}

/** Splits one word into maximal same-family pieces, so "北京2024" indexes as Chinese bigrams
 * beside a number instead of as one token neither a Chinese nor a numeric query can reach. */
function splitByFamily(token: string): { han: boolean; text: string }[] {
  const pieces: { han: boolean; text: string }[] = [];
  for (const character of token) {
    const han = HAN.test(character);
    const last = pieces.at(-1);
    if (last !== undefined && last.han === han) last.text += character;
    else pieces.push({ han, text: character });
  }
  return pieces;
}

/** The combining-marks block Latin borrows. Even this is not safe to strip by itself: NFKD
 * decomposes Cyrillic й into и plus a breve from this very block, and и and й are two
 * different letters, not one letter with decoration. So a mark is dropped only when the base
 * it sits on is Latin — see stripLatinDiacritics. */
const COMBINING_DIACRITICS = /[\u0300-\u036f]/u;
const LATIN_BASE = /\p{Script=Latin}/u;

/** Drops combining marks that decorate a Latin letter and keeps every other mark exactly
 * where it is. Walking character by character is the only way to know which is which: the
 * mark itself carries no clue about the script it belongs to. */
function stripLatinDiacritics(decomposed: string): string {
  let onLatin = false;
  let result = "";
  for (const character of decomposed) {
    if (COMBINING_DIACRITICS.test(character)) {
      if (!onLatin) result += character;
      continue;
    }
    onLatin = LATIN_BASE.test(character);
    result += character;
  }
  return result;
}

/**
 * The folding both sides of the index must apply, character for character.
 *
 * Decompose *compatibly*, drop the marks that decorate a Latin letter, recompose, lowercase. So "café" and "cafe"
 * are one word, and so are the precomposed and decomposed spellings of "café" — which matters
 * because a French PDF and a French question are routinely written in different normal forms
 * and a reader has no way to know.
 *
 * The compatibility half (NFKD rather than NFD) is not tidiness, it is the difference between
 * a PDF being searchable and not. Extracting text from a PDF typeset in a CJK font hands back
 * Kangxi radicals where ordinary characters were written — ⽅ (U+2F45) for 方 (U+65B9) — and
 * those are Unicode *symbols*, not letters, so a tokenizer stops at them. Measured on a real
 * 40,000-character Chinese PDF: "中文测试文集" came out of the index as 中 / 测试 / 集, three
 * fragments with a hole where each substituted character had been. NFKD maps them back. It
 * also folds full-width Latin and Arabic presentation forms, both for the same reason.
 *
 * It is done here, by us, rather than by SQLite's `remove_diacritics` — and the FTS5 index is
 * created with that option OFF — for one reason: SQLite's version folds marks in every script
 * it has a table for, Devanagari and Bengali vowels included, which is precisely the bug
 * tokenChars.ts exists to prevent. Doing it ourselves means one rule, applied identically when
 * a passage is indexed and when a question is asked, and applied to Latin only.
 *
 * Getting this wrong is not loud. Measured on French: with the index folded and the query not,
 * 69 of 100 sampled questions had at least one accented term whose document frequency came
 * back zero — a term the ranking then weighted as if it appeared everywhere or nowhere.
 */
export function fold(text: string): string {
  return stripLatinDiacritics(text.normalize("NFKD")).normalize("NFC").toLowerCase();
}

export function analyze(text: string, options: AnalyzeOptions = {}): Analyzed {
  const tokens: string[] = [];
  const stems: string[] = [];
  const words = fold(text).match(tokenPattern()) ?? [];
  for (const word of words) {
    for (const piece of splitByFamily(word)) {
      if (piece.han) {
        tokens.push(...hanBigrams(piece.text));
        continue;
      }
      tokens.push(piece.text);
      const language =
        options.stem === undefined ? null : stemLanguageFor(piece.text, options.language);
      if (language === null || options.stem === undefined) continue;
      const stem = options.stem(piece.text, language);
      if (stem !== "" && stem !== piece.text) stems.push(stem);
    }
  }
  return { tokens, stems };
}

/** The two column values an FTS5 row holds. Space-joined because the index's own tokenizer
 * splits on spaces and nothing in a token can be one. */
export function analyzedFields(analyzed: Analyzed): { body: string; stems: string } {
  return { body: analyzed.tokens.join(" "), stems: analyzed.stems.join(" ") };
}

/** A question can be long, and every extra term is another posting list to walk. Fifty
 * distinct terms is far past where a real question stops adding signal. */
export const MAX_QUERY_TERMS = 50;

/**
 * The MATCH expression for a query: every distinct term, OR-ed, each one quoted so that a
 * word like "AND" or a stray "*" is a term rather than syntax. Empty when the question held
 * no indexable characters at all — the caller skips the query rather than matching everything.
 */
export function matchExpression(analyzed: Analyzed): string {
  const terms = [...new Set([...analyzed.tokens, ...analyzed.stems])].slice(0, MAX_QUERY_TERMS);
  return terms.map((term) => `"${term}"`).join(" OR ");
}
