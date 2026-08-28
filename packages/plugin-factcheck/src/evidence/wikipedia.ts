/**
 * Purpose: Wikipedia evidence provider — key-free REST search + page summary, multi-language
 * (zh first for Chinese learners, then en), every response Zod-validated at the boundary.
 * Main exports: createWikipediaProvider.
 */
import { z } from "zod";
import type { EvidenceItem, EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS } from "./provider";

const searchResponseSchema = z.object({
  pages: z.array(z.object({ key: z.string(), title: z.string() })),
});

const summaryResponseSchema = z.object({
  title: z.string(),
  extract: z.string(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }).optional(),
});

const USER_AGENT = "Breadcrumb/0.1 (https://github.com/Kali-Leo/Breadcrumb)";

/** The Wikimedia User-Agent policy's Api-User-Agent escape hatch exists for browser JS that
 * *cannot* set User-Agent. Tauri's Rust HTTP client can, so we send both: sending only the
 * substitute header is how a non-browser client gets silently throttled or blocked. */
const WIKIPEDIA_HEADERS: Readonly<Record<string, string>> = {
  "Api-User-Agent": USER_AGENT,
  "User-Agent": USER_AGENT,
};

const SNIPPET_MAX_LENGTH = 600;

/** Search hits taken per language edition. A specific date or figure is rarely in the top
 * article's lead paragraph, and a second hit is one extra request, not one extra search. */
const PAGES_PER_LANGUAGE = 2;

export interface WikipediaProviderOptions {
  fetchImpl: FetchLike;
  /** Wikipedia language editions to query, in priority order. */
  languages?: readonly string[];
  /** Per-request timeout; blocked networks hang instead of failing, so keep this tight. */
  timeoutMs?: number;
}

/** One language edition's outcome: what it produced, and whether it could be reached at all. */
interface LanguageOutcome {
  items: EvidenceItem[];
  failed: boolean;
}

export function createWikipediaProvider(options: WikipediaProviderOptions): EvidenceProvider {
  const languages = options.languages ?? ["zh", "en"];
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

async function fetchSummary(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  pageKey: string,
): Promise<EvidenceItem | null> {
  const summaryUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageKey)}`;
  const summaryResponse = await fetchImpl(summaryUrl, {
    headers: WIKIPEDIA_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!summaryResponse.ok) return null;
  const summary = summaryResponseSchema.parse(await summaryResponse.json());
  if (summary.extract.length === 0) return null;
  return {
    url:
      summary.content_urls?.desktop.page ??
      `https://${language}.wikipedia.org/wiki/${encodeURIComponent(pageKey)}`,
    title: summary.title,
    snippet: summary.extract.slice(0, SNIPPET_MAX_LENGTH),
    source: "wikipedia",
  };
}

async function searchOneLanguage(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  query: string,
  limit: number,
): Promise<LanguageOutcome> {
  let searchResult: z.infer<typeof searchResponseSchema>;
  try {
    const searchUrl = `https://${language}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${PAGES_PER_LANGUAGE}`;
    const searchResponse = await fetchImpl(searchUrl, {
      headers: WIKIPEDIA_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!searchResponse.ok) return { items: [], failed: true };
    searchResult = searchResponseSchema.parse(await searchResponse.json());
  } catch {
    return { items: [], failed: true };
  }

  // The search answered, so this edition is reachable: a page whose summary then fails is a
  // gap in the material, not a failure of the search.
  const items: EvidenceItem[] = [];
  for (const page of searchResult.pages.slice(0, limit)) {
    try {
      const item = await fetchSummary(fetchImpl, timeoutMs, language, page.key);
      if (item !== null) items.push(item);
    } catch {
      // One unreadable summary must not discard the hits around it.
    }
  }
  return { items, failed: false };
}
