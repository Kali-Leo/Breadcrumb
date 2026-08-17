/**
 * Purpose: pulls the words worth searching for out of what the reader has actually read (spec
 * 053 §4's active recall) — titles and summaries of the cards they opened, saved or finished,
 * turned into a handful of query terms for Hacker News / arXiv / iTunes. Entirely local and
 * entirely arithmetic: no LLM, no network, no model file. Latin words are read as words, CJK
 * text as character bigrams chained back into longer terms, which is the standard zero-resource
 * way to get usable Chinese query terms without a segmentation dictionary.
 * Main exports: extractSalientKeywords, SalientKeyword.
 */

export interface SalientKeyword {
  term: string;
  /** How many of the given documents the term appeared in — spread across what the reader read
   * matters more than being repeated inside one item. */
  documentCount: number;
  totalCount: number;
  score: number;
}

/** Latin words shorter than this are noise ("ai" is the price we pay; a two-letter query is
 * worse than no query). */
const MINIMUM_LATIN_WORD_LENGTH = 3;

/** Function words carry no topic. Small on purpose: this list only has to stop the words that
 * would otherwise top every ranking. */
const LATIN_STOPWORDS = new Set(
  [
    "the and for with that this from you your our are was were have has had not but all can",
    "will would should could what when how why who its it's their they them there here about",
    "into over than then some such more most one two new now out off own via use used using",
    "make made get got just like also been being does did doing any may might must shall each",
    "other only very too much many few",
  ]
    .join(" ")
    .split(" "),
);

/** Chinese characters that are grammar rather than subject matter: a bigram containing one is
 * a fragment, not a term. */
const CJK_FUNCTION_CHARACTERS = new Set([
  ..."的了着过是在和与及或但而就都也很不我你他她它们这那之其此把被让吗呢吧啊么什怎为以于对从把向再还又并且则so",
]);

const HAN_RUN = /[一-鿿]+/g;
const LATIN_WORD = /[a-z][a-z0-9+#.-]*/g;

function countInto(counts: Map<string, number>, term: string): void {
  counts.set(term, (counts.get(term) ?? 0) + 1);
}

/** Every CJK bigram in one run of Han characters, minus the ones holding a function character. */
function collectHanBigrams(run: string, counts: Map<string, number>): void {
  for (let index = 0; index + 1 < run.length; index += 1) {
    const first = run[index];
    const second = run[index + 1];
    if (first === undefined || second === undefined) continue;
    if (CJK_FUNCTION_CHARACTERS.has(first) || CJK_FUNCTION_CHARACTERS.has(second)) continue;
    countInto(counts, `${first}${second}`);
  }
}

function collectLatinWords(text: string, counts: Map<string, number>): void {
  for (const match of text.toLowerCase().matchAll(LATIN_WORD)) {
    const word = match[0].replace(/[.-]+$/, "");
    if (word.length < MINIMUM_LATIN_WORD_LENGTH) continue;
    if (LATIN_STOPWORDS.has(word)) continue;
    countInto(counts, word);
  }
}

/** One document's terms with their counts inside that document. */
function termsOfDocument(document: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const run of document.matchAll(HAN_RUN)) collectHanBigrams(run[0], counts);
  collectLatinWords(document, counts);
  return counts;
}

/**
 * Chains overlapping bigrams of equal weight back into the word they came from: 机器 and 器学
 * and 学习 all appearing the same number of times is what "机器学习" looks like after bigram
 * splitting, so it is put back together. Chains stop as soon as the next bigram appears a
 * different number of times, which is what keeps 学习 from swallowing an unrelated neighbour.
 */
function chainBigrams(counts: Map<string, number>): Map<string, number> {
  const chained = new Map<string, number>(counts);
  const consumed = new Set<string>();
  const maximumChainLength = 8;

  for (const [seed, count] of counts) {
    if (seed.length !== 2 || consumed.has(seed)) continue;
    consumed.add(seed);
    let chain = seed;
    let current = seed;
    while (chain.length < maximumChainLength) {
      const tail = current.slice(1);
      const next = [...counts].find(
        ([other, otherCount]) =>
          other.length === 2 &&
          other.startsWith(tail) &&
          otherCount === count &&
          !consumed.has(other),
      );
      if (next === undefined) break;
      consumed.add(next[0]);
      chained.delete(next[0]);
      chain += next[0].slice(1);
      current = next[0];
    }
    if (chain !== seed) {
      chained.delete(seed);
      chained.set(chain, count);
    }
  }
  return chained;
}

/** How often a document's terms contain `term` — "机器学习入门" in one item and "机器学习" in
 * another are the same interest, so the shorter term is credited with both. */
function occurrencesWithin(documentTerms: Map<string, number>, term: string): number {
  let total = 0;
  for (const [other, count] of documentTerms) {
    if (other === term || other.includes(term)) total += count;
  }
  return total;
}

/** Drops a term whose longer, more specific form is just as widely read: with 机器学习 and
 * 机器学习入门 both appearing in one item only, the specific one is the better query. */
function dropRedundantTerms(keywords: readonly SalientKeyword[]): SalientKeyword[] {
  return keywords.filter(
    (keyword) =>
      !keywords.some(
        (other) =>
          other.term !== keyword.term &&
          other.term.includes(keyword.term) &&
          other.documentCount >= keyword.documentCount,
      ),
  );
}

/**
 * Ranks the terms across all the documents. A term that shows up in three different things the
 * reader read outranks one mentioned three times in a single article: the first says something
 * about the reader, the second may just be an author's tic.
 */
export function rankKeywords(documents: readonly string[]): SalientKeyword[] {
  const perDocument = documents.map((document) => chainBigrams(termsOfDocument(document)));
  const universe = new Set<string>();
  for (const terms of perDocument) for (const term of terms.keys()) universe.add(term);

  const ranked: SalientKeyword[] = [...universe].map((term) => {
    let documentCount = 0;
    let totalCount = 0;
    for (const documentTerms of perDocument) {
      const occurrences = occurrencesWithin(documentTerms, term);
      if (occurrences > 0) documentCount += 1;
      totalCount += occurrences;
    }
    return {
      term,
      documentCount,
      totalCount,
      score: documentCount + 0.25 * (totalCount - documentCount),
    };
  });
  ranked.sort(
    (a, b) => b.score - a.score || b.term.length - a.term.length || a.term.localeCompare(b.term),
  );
  return dropRedundantTerms(ranked);
}

/**
 * The top `limit` query terms from what the reader read. Terms seen in only one item are kept:
 * early on, one opened article is genuinely all the evidence there is, and the ranking already
 * puts anything with wider support ahead of them.
 */
export function extractSalientKeywords(documents: readonly string[], limit: number): string[] {
  if (limit <= 0) return [];
  return rankKeywords(documents)
    .slice(0, limit)
    .map((keyword) => keyword.term);
}
