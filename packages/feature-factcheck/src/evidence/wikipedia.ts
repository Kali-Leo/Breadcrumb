/**
 * Purpose: Wikipedia evidence provider (layer 2, encyclopaedic prose) — key-free, CORS-open
 * with `origin=*` (measured: the Action API sends no CORS header without it), across the
 * learner's edition and English. Full-text search (`list=search`, CirrusSearch) rather than
 * title search: the hit's snippet lands on the sentence that states the figure, where a
 * title match's 600-character lead paragraph usually does not (measured on 珠峰海拔). The
 * judging window is then cut from the whole article's plain text (`prop=extracts`) around
 * that sentence, so the judge reads context and not a search excerpt.
 * Main exports: createWikipediaProvider, WikipediaProviderOptions.
 */
import { z } from "zod";
import { EVIDENCE_WINDOW_LENGTH, keywordWindowOfText } from "./pageText";
import type { EvidenceItem, EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS, stripHtml } from "./provider";
import { EDITION_PATTERN, fetchWikimediaJson } from "./wikimedia";

const searchResponseSchema = z.object({
  query: z.object({
    search: z.array(z.object({ pageid: z.number().int(), title: z.string(), snippet: z.string() })),
  }),
});

const extractResponseSchema = z.object({
  query: z.object({
    pages: z.array(z.object({ title: z.string(), extract: z.string().optional() })),
  }),
});

/** Search hits taken per language edition. A specific figure is often in the second-ranked
 * article (a mountain range's page lists every peak's height), and a second hit is one extra
 * request, not one extra search. */
const PAGES_PER_LANGUAGE = 2;

/** A search-snippet fragment shorter than this is too common a string to locate in the
 * article with any confidence. */
const MIN_LOCATOR_LENGTH = 12;

export interface WikipediaProviderOptions {
  fetchImpl: FetchLike;
  /** Wikipedia language editions to query, in priority order. */
  languages?: readonly string[];
  /** Per-request timeout; blocked networks hang instead of failing, so keep this tight. */
  timeoutMs?: number;
}

interface LanguageOutcome {
  items: EvidenceItem[];
  failed: boolean;
}

export function createWikipediaProvider(options: WikipediaProviderOptions): EvidenceProvider {
  const languages = (options.languages ?? ["zh", "en"]).filter((language) =>
    EDITION_PATTERN.test(language),
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "wikipedia",
    async search(query: string, limit: number): Promise<EvidenceSearchResult> {
      const items: EvidenceItem[] = [];
      let anyLanguageAnswered = false;
      for (const language of languages) {
        if (items.length >= limit) break;
        const outcome = await searchOneLanguage(
          options.fetchImpl,
          timeoutMs,
          language,
          query,
          Math.min(limit - items.length, PAGES_PER_LANGUAGE),
        );
        if (!outcome.failed) anyLanguageAnswered = true;
        items.push(...outcome.items);
      }
      // Reached only when every edition we tried refused to answer — Wikipedia being blocked
      // is not evidence that no public source exists.
      return { items: items.slice(0, limit), failed: !anyLanguageAnswered };
    },
  };
}

function apiUrl(language: string, params: Record<string, string>): string {
  const search = new URLSearchParams({
    format: "json",
    formatversion: "2",
    origin: "*",
    ...params,
  });
  return `https://${language}.wikipedia.org/w/api.php?${search.toString()}`;
}

/** The hit's snippet as text. CirrusSearch wraps matched terms in <span> INSIDE words, so the
 * tags are removed rather than replaced by a space (stripHtml's rule, right for block markup
 * and wrong here: it would split 珠穆朗玛峰 from the sentence it is in). */
function snippetText(snippetHtml: string): string {
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

async function fetchExtract(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  pageId: number,
): Promise<string | null> {
  const url = apiUrl(language, {
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    pageids: String(pageId),
  });
  const payload = await fetchWikimediaJson(fetchImpl, timeoutMs, url);
  if (payload === null) return null;
  return extractResponseSchema.parse(payload).query.pages[0]?.extract ?? null;
}

async function searchOneLanguage(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  query: string,
  limit: number,
): Promise<LanguageOutcome> {
  let hits: z.infer<typeof searchResponseSchema>["query"]["search"];
  try {
    const url = apiUrl(language, {
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: String(PAGES_PER_LANGUAGE),
      utf8: "1",
    });
    const payload = await fetchWikimediaJson(fetchImpl, timeoutMs, url);
    if (payload === null) return { items: [], failed: true };
    hits = searchResponseSchema.parse(payload).query.search;
  } catch {
    return { items: [], failed: true };
  }

  // The search answered, so this edition is reachable: an article whose text then fails to
  // arrive is a gap in the material, not a failure of the search — the hit's own snippet
  // stands in for it.
  const items: EvidenceItem[] = [];
  for (const hit of hits.slice(0, limit)) {
    let extract: string | null = null;
    try {
      extract = await fetchExtract(fetchImpl, timeoutMs, language, hit.pageid);
    } catch {
      extract = null;
    }
    const snippet =
      (extract === null ? null : windowAround(extract, hit.snippet, query)) ??
      snippetText(hit.snippet);
    if (snippet.length === 0) continue;
    items.push({
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      title: hit.title,
      snippet,
      source: "wikipedia",
    });
  }
  return { items, failed: false };
}
