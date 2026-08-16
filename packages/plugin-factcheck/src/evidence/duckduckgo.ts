/**
 * Purpose: DuckDuckGo evidence provider (fallback) — scrapes the key-free HTML endpoint with
 * cheerio (real DOM traversal, so a result-block link and its snippet stay paired by DOM
 * structure rather than by list index), decodes redirect links, and only surfaces results
 * whose page is actually reachable (fetch-and-verify). Main exports: createDuckDuckGoProvider.
 */
import { load } from "cheerio";
import type { EvidenceItem, EvidenceProvider, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS, stripHtml } from "./provider";

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
    async search(query: string, limit: number): Promise<EvidenceItem[]> {
      try {
        const response = await options.fetchImpl(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          { signal: AbortSignal.timeout(timeoutMs) },
        );
        if (!response.ok) return [];
        const candidates = parseResults(await response.text());
        if (candidates.length === 0) {
          // Headless package: no DB, so this can't reach recordAiFailure (app-side, see
          // apps/desktop/src/lib/failureLog.ts) — a distinctive prefix is the next best
          // signal that DuckDuckGo's markup drifted out from under the cheerio selectors.
          console.warn("[factcheck:duckduckgo] parsed 0 result candidates from a 200 response");
        }
        return await verifyCandidates(options.fetchImpl, timeoutMs, candidates, limit);
      } catch {
        return [];
      }
    },
  };
}

interface ResultCandidate {
  url: string;
  title: string;
  snippet: string;
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

async function verifyCandidates(
  fetchImpl: FetchLike,
  timeoutMs: number,
  candidates: readonly ResultCandidate[],
  limit: number,
): Promise<EvidenceItem[]> {
  const verified: EvidenceItem[] = [];
  for (const candidate of candidates) {
    if (verified.length >= limit) break;
    try {
      const response = await fetchImpl(candidate.url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) continue;
      verified.push({ ...candidate, source: "duckduckgo" });
    } catch {
      // Unreachable page: never surface a link we could not open ourselves.
    }
  }
  return verified;
}
