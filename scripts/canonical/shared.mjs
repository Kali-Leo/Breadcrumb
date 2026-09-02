/**
 * Purpose: the one label normalization the whole canonical pipeline compares strings with.
 * Every step here folds labels the same way before a containment or equality check — NFKC so
 * full-width and half-width forms meet, lowercase so "Async"/"async" meet, and all whitespace
 * stripped so "async await" and "asyncawait" meet.
 *
 * Extracted 2026-09-02 from six inline copies. Five were byte-identical; extract-kebiao.mjs's
 * was missing `.toLowerCase()`, which made no difference to Chinese headings but let a
 * Latin-script term embedded in one (a 课标 line naming "Python" or "CSS") fail a containment
 * check that every other step would have passed. Adopting the lowercase version is a
 * deliberate behaviour fix, not a pure refactor; it only widens what matches.
 *
 * Kept out of packages/: these are dev-time Node scripts, and scripts reaching back into the
 * TypeScript sources of a workspace package is a dependency this pipeline should not have.
 * Main exports: normalize.
 */

/** NFKC-fold, lowercase, strip ALL whitespace. */
export function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}
