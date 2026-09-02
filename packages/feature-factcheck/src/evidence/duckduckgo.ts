/**
 * Purpose: DuckDuckGo evidence provider (fallback) — scrapes the key-free HTML endpoint with
 * cheerio (real DOM traversal, so a result-block link and its snippet stay paired by DOM
 * structure rather than by list index), decodes redirect links, and only surfaces results
 * whose page is actually reachable (fetch-and-verify). Main exports: createDuckDuckGoProvider.
 */
import { load } from "cheerio";
import type { EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS, SEARCH_MAX_REDIRECTS, stripHtml } from "./provider";
import { withRequestBudget } from "./requestBudget";
import { type ResultCandidate, verifyCandidates } from "./verify";

const SNIPPET_MAX_LENGTH = 600;

export interface DuckDuckGoProviderOptions {
  fetchImpl: FetchLike;
  /** Per-request timeout; blocked networks hang instead of failing, so keep this tight. */
  timeoutMs?: number;
}

export function createDuckDuckGoProvider(options: DuckDuckGoProviderOptions): EvidenceProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "duckduckgo",
    async search(query: string, limit: number): Promise<EvidenceSearchResult> {
      try {
        const html = await withRequestBudget(timeoutMs, async (signal) => {
          const response = await options.fetchImpl(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            {
              signal,
              // A fixed host we chose ourselves, so a couple of hops are fine — but not the
              // platform default of ten, and not silently.
              maxRedirections: SEARCH_MAX_REDIRECTS,
            },
          );
          return response.ok ? await response.text() : null;
        });
        if (html === null) return { items: [], failed: true };
        const candidates = parseResults(html);
        if (candidates.length === 0) {
          // A search engine answering 200 with no result block at all is markup drift (or
          // the rate limiter) far more often than a genuinely empty result set, and the two
          // are indistinguishable from here — so this counts as a failed search, never as
          // "nothing exists". The console line stays because this headless package has no
          // DB; the host reads `failed` and writes the ai_failures row.
          console.warn("[factcheck:duckduckgo] parsed 0 result candidates from a 200 response");
          return { items: [], failed: true };
        }
        return await verifyCandidates(
          options.fetchImpl,
          timeoutMs,
          candidates,
          limit,
          "duckduckgo",
          query,
        );
      } catch {
        return { items: [], failed: true };
      }
    },
  };
}

function parseResults(html: string): ResultCandidate[] {
  const candidates: ResultCandidate[] = [];
  const $ = load(html);
  // Each result lives in one block carrying (among others) the "result" class; scoping the
  // title/snippet lookup to that block keeps them paired by DOM structure, not list index.
  $(".result").each((_index, element) => {
    const $item = $(element);
    const $link = $item.find(".result__a").first();
    const url = decodeRedirectUrl($link.attr("href") ?? "");
    const title = stripHtml($link.html() ?? "");
    const snippet = stripHtml($item.find(".result__snippet").first().html() ?? "");
    if (url !== null && title.length > 0 && snippet.length > 0) {
      candidates.push({ url, title, snippet: snippet.slice(0, SNIPPET_MAX_LENGTH) });
    }
  });
  return candidates;
}

/** DuckDuckGo wraps result links as //duckduckgo.com/l/?uddg=<encoded-target>. */
function decodeRedirectUrl(rawHref: string): string | null {
  try {
    const href = rawHref.startsWith("//") ? `https:${rawHref}` : rawHref;
    const parsed = new URL(href);
    const target = parsed.pathname.startsWith("/l/") ? parsed.searchParams.get("uddg") : href;
    if (target === null || !target.startsWith("http")) return null;
    return target;
  } catch {
    return null;
  }
}
