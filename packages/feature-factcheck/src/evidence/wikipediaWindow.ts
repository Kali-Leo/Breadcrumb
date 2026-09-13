/**
 * Purpose: turning one Wikipedia search hit plus its article into the passage a judge reads.
 * Separated from the provider because it is pure text work with no network in it: locating
 * the hit's own sentence inside the article, and cutting the judging window around it.
 * Main exports: snippetText, windowAround.
 */
import { EVIDENCE_WINDOW_LENGTH, keywordWindowOfText } from "./pageText";
import { stripHtml } from "./provider";

/** A search-snippet fragment shorter than this is too common a string to locate in the
 * article with any confidence. */
const MIN_LOCATOR_LENGTH = 12;

/** The hit's snippet as text. CirrusSearch wraps matched terms in <span> INSIDE words, so the
 * tags are removed rather than replaced by a space (stripHtml's rule, right for block markup
 * and wrong here: it would split 珠穆朗玛峰 from the sentence it is in). */
export function snippetText(snippetHtml: string): string {
  return stripHtml(snippetHtml.replace(/<[^>]+>/g, ""));
}

/** The longest run of the search snippet that could be looked up verbatim in the article:
 * CirrusSearch joins fragments with ellipses, and one fragment is enough. */
function snippetLocator(snippetHtml: string): string | null {
  const fragments = snippetText(snippetHtml)
    .split(/…|\.\.\./)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= MIN_LOCATOR_LENGTH);
  return fragments.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** The judging window: around the search hit's own sentence where it can be found in the
 * article, around the query terms otherwise, the whole text when it is short. */
export function windowAround(extract: string, snippetHtml: string, query: string): string | null {
  const text = extract.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  if (text.length <= EVIDENCE_WINDOW_LENGTH) return text;
  const locator = snippetLocator(snippetHtml);
  const at = locator === null ? -1 : text.indexOf(locator);
  if (at >= 0) {
    const lead = Math.floor(EVIDENCE_WINDOW_LENGTH / 3);
    const start = Math.max(0, Math.min(at - lead, text.length - EVIDENCE_WINDOW_LENGTH));
    return text.slice(start, start + EVIDENCE_WINDOW_LENGTH);
  }
  return keywordWindowOfText(text, query);
}
