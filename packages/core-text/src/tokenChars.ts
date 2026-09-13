/**
 * Purpose: the character set that decides where a word ends, shared by the two places that
 * must never disagree about it — the SQL that builds the FTS5 index and the JavaScript that
 * tokenizes a query.
 *
 * SQLite's `unicode61` tokenizer counts only Unicode categories L* and N* as word characters.
 * Devanagari and Bengali write their vowels as combining marks (Mn/Mc), so left alone it does
 * not merely index those languages badly, it shreds them: measured on the full MIRACL corpora,
 * the highest-document-frequency "words" in the Hindi index were the bare consonants क र ह म,
 * and BM25 nDCG@10 was 0.099 against 0.330 once the marks were declared word characters
 * (Bengali 0.170 → 0.384). See docs/research/2026-09-12-检索与重排-大规模实测.md §4.1.
 *
 * The other half of that fix is the half that is easy to miss, and it is why this file exists
 * rather than a string in the DDL: JavaScript's `\w` does not contain combining marks either.
 * Fixing only the index side leaves the two sides cutting words in different places, and the
 * measured result of that was not "slightly worse" — Bengali retrieval went to nDCG@10 0.0000.
 *
 * The set is enumerated rather than taken as all of \p{Mn}\p{Mc} because the FTS5 side has to
 * be a literal list of characters, and the two sides are only equal if they are the same list.
 * It covers the scripts this product ships interface languages for; a mark outside it would
 * survive tokenization here and then be split by SQLite, which is the exact bug above.
 * Main exports: TOKEN_MARK_RANGES, ftsTokenChars, TOKEN_PATTERN, tokenPattern.
 */

/** Inclusive code-point ranges, by the script that needs them. */
export const TOKEN_MARK_RANGES: readonly (readonly [number, number])[] = [
  // Combining diacritical marks — decomposed Latin (and anything else that borrows them).
  [0x0300, 0x036f],
  // Arabic: the short-vowel and gemination marks, plus the Quranic annotation range.
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e8],
  [0x06ea, 0x06ed],
  // Devanagari: anusvara/visarga, nukta, the matras, virama, and the vedic tone marks.
  [0x0900, 0x0903],
  [0x093a, 0x093c],
  [0x093e, 0x094f],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  // Bengali: the same shape of thing. 09BD (avagraha) is a letter and needs no help.
  [0x0981, 0x0983],
  [0x09bc, 0x09bc],
  [0x09be, 0x09c4],
  [0x09c7, 0x09c8],
  [0x09cb, 0x09cd],
  [0x09d7, 0x09d7],
  [0x09e2, 0x09e3],
  // Zero-width non-joiner and joiner: not marks, but they sit inside Indic conjuncts and a
  // tokenizer that breaks on them cuts words in half just as effectively.
  [0x200c, 0x200d],
];

function expand(): string[] {
  const characters: string[] = [];
  for (const [start, end] of TOKEN_MARK_RANGES) {
    for (let code = start; code <= end; code += 1) characters.push(String.fromCodePoint(code));
  }
  return characters;
}

const MARK_CHARACTERS = expand();

/**
 * The literal for `tokenize = "unicode61 remove_diacritics 0 tokenchars '<this>'"`.
 *
 * None of these characters is a quote or a backslash, so it needs no escaping — but it is
 * built here rather than pasted into the DDL so that adding a script means editing one list.
 */
export function ftsTokenChars(): string {
  return MARK_CHARACTERS.join("");
}

/** The same set as a regular-expression character class body, for the query side. */
function markClassBody(): string {
  return TOKEN_MARK_RANGES.map(
    ([start, end]) =>
      `\\u{${start.toString(16)}}${start === end ? "" : `-\\u{${end.toString(16)}}`}`,
  ).join("");
}

/**
 * One word. `\p{L}\p{N}` is the L and N that unicode61 already accepts; the rest is the list
 * above, restated. Fresh instances rather than one shared regex because `g` carries
 * `lastIndex` between calls and a shared one silently skips text.
 */
export function tokenPattern(): RegExp {
  return new RegExp(`[\\p{L}\\p{N}${markClassBody()}]+`, "gu");
}

/** The pattern's source, for tests and for anyone who needs to read it. */
export const TOKEN_PATTERN = tokenPattern().source;
