/**
 * Purpose: the `tokenize =` clause migration 0056 gives its FTS5 index, frozen as data.
 *
 * A shipped migration is never edited, so this cannot import the live character set from
 * @breadcrumb/core-text: the day someone adds a script to that set, every already-migrated
 * database would silently be running a different tokenizer from the DDL that built it. So the
 * ranges are copied here as numbers — readable and diffable, unlike two hundred invisible
 * combining marks pasted into a string literal — and ftsTokenize.test.ts fails the build if
 * the copy and the original ever drift. The fix for a failing test is a NEW migration that
 * rebuilds the index, never an edit to this file.
 *
 * What the clause says, and why each part of it:
 *  - `unicode61` because trigram cannot do BM25 usefully and the product's text is already
 *    analyzed before it gets here (see core-text/analyzer.ts).
 *  - `remove_diacritics 0` because the aggressive settings strip marks from every script,
 *    Devanagari and Bengali vowels included — which is the exact bug the tokenchars list
 *    below exists to prevent. Case and NFC folding are done by the analyzer, on both sides.
 *  - `tokenchars` because unicode61 accepts only categories L and N, and those two scripts
 *    write their vowels as combining marks.
 * Main exports: FTS_TOKENIZE, ftsTokenCharsAt0056, FTS_MARK_RANGES_AT_0056.
 */

/** A verbatim copy of TOKEN_MARK_RANGES as it stood when 0056 shipped. */
export const FTS_MARK_RANGES_AT_0056: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0900, 0x0903],
  [0x093a, 0x093c],
  [0x093e, 0x094f],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x0981, 0x0983],
  [0x09bc, 0x09bc],
  [0x09be, 0x09c4],
  [0x09c7, 0x09c8],
  [0x09cb, 0x09cd],
  [0x09d7, 0x09d7],
  [0x09e2, 0x09e3],
  [0x200c, 0x200d],
];

export function ftsTokenCharsAt0056(): string {
  const characters: string[] = [];
  for (const [start, end] of FTS_MARK_RANGES_AT_0056) {
    for (let code = start; code <= end; code += 1) characters.push(String.fromCodePoint(code));
  }
  return characters.join("");
}

/** None of these characters is a quote or a backslash, so the single-quoted SQL string needs
 * no escaping — asserted in the test rather than assumed. */
export const FTS_TOKENIZE = `tokenize = "unicode61 remove_diacritics 0 tokenchars '${ftsTokenCharsAt0056()}'"`;
