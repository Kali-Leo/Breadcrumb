/**
 * Purpose: Wikipedia evidence provider (layer 2, encyclopaedic prose) — key-free, CORS-open
 * with `origin=*` (measured: the Action API sends no CORS header without it), across the
 * learner's edition and English. Full-text search (`list=search`, CirrusSearch) rather than
 * title search: the hit's snippet lands on the sentence that states the figure, where a
 * title match's 600-character lead paragraph usually does not (measured on 珠峰海拔). The
 * judging window is then cut from the whole article's plain text (`prop=extracts`) around
 * that sentence, so the judge reads context and not a search excerpt (wikipediaWindow.ts).
 * Main exports: createWikipediaProvider, WikipediaProviderOptions.
 */
import { z } from "zod";
import type { EvidenceItem, EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS } from "./provider";
import { EDITION_PATTERN, fetchWikimediaJson } from "./wikimedia";
import { snippetText, windowAround } from "./wikipediaWindow";

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

export interface WikipediaProviderOptions {
  fetchImpl: FetchLike;
  /** Wikipedia language editions to query, in priority order. */
  languages?: readonly string[];
  /** MediaWiki script/region variant (`zh-cn`) the article text is converted to, so the
   * quoted evidence uses the same words as the interface around it. Null asks for none. */
  variant?: string | null;
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
  const variant = options.variant ?? null;
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
          variant,
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

function apiUrl(language: string, params: Record<string, string>, variant: string | null): string {
  const search = new URLSearchParams({
    format: "json",
    formatversion: "2",
    origin: "*",
    ...(variant === null ? {} : { variant }),
    ...params,
  });
  return `https://${language}.wikipedia.org/w/api.php?${search.toString()}`;
}

async function fetchExtract(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  pageId: number,
  variant: string | null,
): Promise<string | null> {
  const url = apiUrl(
    language,
    {
      action: "query",
      prop: "extracts",
      explaintext: "1",
      redirects: "1",
      pageids: String(pageId),
    },
    variant,
  );
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
  variant: string | null,
): Promise<LanguageOutcome> {
  let hits: z.infer<typeof searchResponseSchema>["query"]["search"];
  try {
    const url = apiUrl(
      language,
      {
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: String(PAGES_PER_LANGUAGE),
        utf8: "1",
      },
      variant,
    );
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
      extract = await fetchExtract(fetchImpl, timeoutMs, language, hit.pageid, variant);
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
