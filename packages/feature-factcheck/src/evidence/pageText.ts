/**
 * Purpose: turn a fetched result page into judging material. The page body is already in
 * memory after fetch-and-verify, and judging on body text rather than a search summary is
 * the single biggest free win available here — humans judge truth at 71% accuracy on source
 * text against 40% on summaries, and call the material sufficient 82% vs 46% of the time
 * (Hu et al., EMNLP 2023). Main exports: EVIDENCE_WINDOW_LENGTH, extractKeywordWindow.
 */
import { load } from "cheerio";

/** Roughly a page-and-a-half of prose: enough to carry a date or a figure with its context,
 * small enough that three of them per claim stay well inside a judging prompt. */
export const EVIDENCE_WINDOW_LENGTH = 1500;

/** Hard ceiling on the HTML we are willing to parse. A response body is external input of
 * unbounded size; past this the page is an asset dump or an attack, not an article, and the
 * search summary is the better material anyway. */
const MAX_HTML_LENGTH = 2_000_000;

/** Ignore a page whose readable text is shorter than this — a cookie wall or a JS shell. */
const MIN_USABLE_TEXT_LENGTH = 200;

/** Per term, stop after this many occurrences: scoring every hit on a term like "the" would
 * turn window selection into a quadratic scan of the whole page. */
const MAX_OCCURRENCES_PER_TERM = 40;

/** Elements whose text is never article prose. */
const NON_CONTENT_SELECTOR = "script, style, noscript, template, svg, nav, header, footer, form";

/** Readable text of an HTML page, or null when there is not enough of it to be worth using. */
export function extractPageText(html: string): string | null {
  if (html.length === 0 || html.length > MAX_HTML_LENGTH) return null;
  const $ = load(html);
  $(NON_CONTENT_SELECTOR).remove();
  const text = $.root().text().replace(/\s+/g, " ").trim();
  return text.length >= MIN_USABLE_TEXT_LENGTH ? text : null;
}

/** Splits a search query into the terms a window is scored against. Whitespace and CJK
 * punctuation are the only separators — a Chinese query stays one term, which is what we
 * want: unsegmented CJK substrings match verbatim. */
function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，.。、;；:：!！?？"'“”‘’()（）[\]【】]+/)
    .filter((term) => term.length > 0);
}

/** How many distinct query terms appear inside one window. */
function distinctTermsIn(windowText: string, terms: readonly string[]): number {
  return terms.filter((term) => windowText.includes(term)).length;
}

/**
 * The stretch of `pageText` that covers the most distinct query terms, `windowLength` long.
 * Returns null when no term appears at all — the caller then keeps the search summary rather
 * than handing the judge an arbitrary slice of an unrelated page.
 */
function bestWindow(
  pageText: string,
  terms: readonly string[],
  windowLength: number,
): string | null {
  const lower = pageText.toLowerCase();
  // A third of the window before the match, two thirds after: the sentence that states a
  // fact usually continues past the term rather than leading up to it.
  const lead = Math.floor(windowLength / 3);
  let bestStart = -1;
  let bestScore = 0;
  for (const term of terms) {
    let index = lower.indexOf(term);
    for (let seen = 0; index !== -1 && seen < MAX_OCCURRENCES_PER_TERM; seen += 1) {
      const start = Math.max(0, Math.min(index - lead, pageText.length - windowLength));
      const score = distinctTermsIn(lower.slice(start, start + windowLength), terms);
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
      index = lower.indexOf(term, index + term.length);
    }
  }
  return bestStart < 0 ? null : pageText.slice(bestStart, bestStart + windowLength);
}

/**
 * Judging material from one fetched page: the window of its body text around the query
 * terms. Null whenever the page yields nothing usable, so every caller keeps a working
 * fallback to the search engine's own summary.
 */
export function extractKeywordWindow(
  html: string,
  query: string,
  windowLength: number = EVIDENCE_WINDOW_LENGTH,
): string | null {
  const pageText = extractPageText(html);
  if (pageText === null) return null;
  if (pageText.length <= windowLength) return pageText;
  const terms = queryTerms(query);
  if (terms.length === 0) return null;
  return bestWindow(pageText, terms, windowLength);
}
