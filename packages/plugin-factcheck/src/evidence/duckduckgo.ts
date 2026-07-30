/**
 * Purpose: DuckDuckGo evidence provider (fallback) — scrapes the key-free HTML endpoint,
 * decodes redirect links, and only surfaces results whose page is actually reachable
 * (fetch-and-verify). Main exports: createDuckDuckGoProvider.
 */
import type { EvidenceItem, EvidenceProvider, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS, stripHtml } from "./provider";

const RESULT_LINK_PATTERN = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const RESULT_SNIPPET_PATTERN = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g;
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
  const links = [...html.matchAll(RESULT_LINK_PATTERN)];
  const snippets = [...html.matchAll(RESULT_SNIPPET_PATTERN)];
  const candidates: ResultCandidate[] = [];
  for (const [index, link] of links.entries()) {
    const url = decodeRedirectUrl(link[1] ?? "");
    const title = stripHtml(link[2] ?? "");
    const snippet = stripHtml(snippets[index]?.[1] ?? "");
    if (url !== null && title.length > 0 && snippet.length > 0) {
      candidates.push({ url, title, snippet: snippet.slice(0, SNIPPET_MAX_LENGTH) });
    }
  }
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
