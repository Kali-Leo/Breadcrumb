/**
 * Purpose: the Snowball stemmers, loaded only when something is actually being indexed or
 * searched.
 *
 * The library is one generated 850 KB file covering twenty-four languages, with no way to ask
 * for six of them. On the desktop that is a local read and costs nothing; in the browser it
 * would be 850 KB on the path to the first screen for a feature most sessions never open. So
 * it is behind a dynamic import: the chunk arrives with the first import or the first search
 * and never before, and callers that do not want stemming simply never call this.
 *
 * A load that fails is not an error the reader should see. Stemming is worth +0.088 nDCG@10
 * on Russian and +0.039 on Arabic (docs/research/2026-09-12-检索与重排-大规模实测.md §4.3);
 * without it keyword search still works on literal words, which is where it was before. So a
 * failure returns a stemmer that stems nothing.
 * Main exports: loadStemmer, identityStem.
 */
// The library ships one generated file and no declarations, so the shape it is used through
// is declared next door. A triple-slash reference rather than only an ambient .d.ts in this
// package's own src: a consumer compiling this file through its own tsconfig (apps/web does)
// would otherwise not have the declaration in its program, and the import would be an implicit
// any — which this repo forbids, correctly.
/// <reference path="./snowball-stemmers.d.ts" />
import type { Stem, StemLanguage } from "./analyzer";

/** What you get when the library could not be loaded: every word is its own stem, which the
 * analyzer reads as "nothing to add to the shadow field". */
export const identityStem: Stem = (word) => word;

let loading: Promise<Stem> | null = null;

async function build(): Promise<Stem> {
  const module = await import("snowball-stemmers");
  const factory = module.newStemmer;
  const cache = new Map<StemLanguage, (word: string) => string>();
  return (word, language) => {
    let stemmer = cache.get(language);
    if (stemmer === undefined) {
      const created = factory(language);
      stemmer = (input: string) => created.stem(input);
      cache.set(language, stemmer);
    }
    return stemmer(word);
  };
}

/** Loaded once per process; a failed load is not held against the next caller, because the
 * chunk may simply not have arrived yet. */
export function loadStemmer(): Promise<Stem> {
  loading ??= build().catch((error: unknown) => {
    loading = null;
    console.warn("stemmers unavailable; keyword search will match literal words only", error);
    return identityStem;
  });
  return loading;
}
