/**
 * Purpose: Wikipedia evidence provider — key-free REST search + page summary, multi-language
 * (zh first for Chinese learners, then en), every response Zod-validated at the boundary.
 * Main exports: createWikipediaProvider.
 */
import { z } from "zod";
import type { EvidenceItem, EvidenceProvider, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS } from "./provider";

const searchResponseSchema = z.object({
  pages: z.array(z.object({ key: z.string(), title: z.string() })),
});

const summaryResponseSchema = z.object({
  title: z.string(),
  extract: z.string(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }).optional(),
});

const API_USER_AGENT = "Breadcrumb/0.1 (https://github.com/Kali-Leo/Breadcrumb)";
const SNIPPET_MAX_LENGTH = 600;

export interface WikipediaProviderOptions {
  fetchImpl: FetchLike;
  /** Wikipedia language editions to query, in priority order. */
  languages?: readonly string[];
  /** Per-request timeout; blocked networks hang instead of failing, so keep this tight. */
  timeoutMs?: number;
}

export function createWikipediaProvider(options: WikipediaProviderOptions): EvidenceProvider {
  const languages = options.languages ?? ["zh", "en"];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "wikipedia",
    async search(query: string, limit: number): Promise<EvidenceItem[]> {
      const items: EvidenceItem[] = [];
      for (const language of languages) {
        if (items.length >= limit) break;
        const item = await searchOneLanguage(options.fetchImpl, timeoutMs, language, query);
        if (item !== null) items.push(item);
      }
      return items.slice(0, limit);
    },
  };
}

async function searchOneLanguage(
  fetchImpl: FetchLike,
  timeoutMs: number,
  language: string,
  query: string,
): Promise<EvidenceItem | null> {
  try {
    const searchUrl = `https://${language}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=1`;
    const searchResponse = await fetchImpl(searchUrl, {
      headers: { "Api-User-Agent": API_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!searchResponse.ok) return null;
    const searchResult = searchResponseSchema.parse(await searchResponse.json());
    const topPage = searchResult.pages[0];
    if (topPage === undefined) return null;

    const summaryUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topPage.key)}`;
    const summaryResponse = await fetchImpl(summaryUrl, {
      headers: { "Api-User-Agent": API_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!summaryResponse.ok) return null;
    const summary = summaryResponseSchema.parse(await summaryResponse.json());
    if (summary.extract.length === 0) return null;

    return {
      url:
        summary.content_urls?.desktop.page ??
        `https://${language}.wikipedia.org/wiki/${encodeURIComponent(topPage.key)}`,
      title: summary.title,
      snippet: summary.extract.slice(0, SNIPPET_MAX_LENGTH),
      source: "wikipedia",
    };
  } catch {
    return null;
  }
}
