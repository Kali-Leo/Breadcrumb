/**
 * Purpose: Bing China evidence provider — key-free cn.bing.com HTML search reachable from
 * mainland China (where Wikipedia/DuckDuckGo are not), with redirect decoding and
 * fetch-and-verify. Main exports: createBingProvider.
 */
import type { EvidenceItem, EvidenceProvider, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS, stripHtml } from "./provider";

/** The real result link lives inside <h2>; a plain first-<a> grab hits the site-attribution link. */
const HEADING_LINK_PATTERN = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const FALLBACK_LINK_PATTERN = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const RESULT_SNIPPET_PATTERN = /<p[^>]*>([\s\S]*?)<\/p>/;
const SNIPPET_MAX_LENGTH = 600;

export interface BingProviderOptions {
  fetchImpl: FetchLike;
  /** Per-request timeout; blocked networks hang instead of failing, so keep this tight. */
  timeoutMs?: number;
}

export function createBingProvider(options: BingProviderOptions): EvidenceProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "bing",
    async search(query: string, limit: number): Promise<EvidenceItem[]> {
      try {
        const response = await options.fetchImpl(
          `https://cn.bing.com/search?q=${encodeURIComponent(query)}`,
          { signal: AbortSignal.timeout(timeoutMs), headers: { "Accept-Language": "zh-CN,zh" } },
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
  const candidates: ResultCandidate[] = [];
  for (const chunk of html.split('<li class="b_algo"').slice(1)) {
    const link = HEADING_LINK_PATTERN.exec(chunk) ?? FALLBACK_LINK_PATTERN.exec(chunk);
    const url = decodeBingUrl(link?.[1] ?? "");
    const title = stripHtml(link?.[2] ?? "");
    const snippet = stripHtml(RESULT_SNIPPET_PATTERN.exec(chunk)?.[1] ?? "");
    if (url !== null && title.length > 0 && snippet.length > 0) {
      candidates.push({ url, title, snippet: snippet.slice(0, SNIPPET_MAX_LENGTH) });
    }
  }
  return candidates;
}

/** Bing sometimes wraps results as bing.com/ck/a?...&u=a1<base64url-target>. */
function decodeBingUrl(rawHref: string): string | null {
  try {
    const parsed = new URL(rawHref, "https://cn.bing.com");
    if (parsed.hostname.endsWith("bing.com") && parsed.pathname.startsWith("/ck/")) {
      const wrapped = parsed.searchParams.get("u");
      if (wrapped === null || !wrapped.startsWith("a1")) return null;
      const base64 = wrapped.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const target = atob(padded);
      return target.startsWith("http") ? target : null;
    }
    if (parsed.hostname.endsWith("bing.com")) return null;
    return rawHref.startsWith("http") ? rawHref : null;
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
      verified.push({ ...candidate, source: "bing" });
    } catch {
      // Unreachable page: never surface a link we could not open ourselves.
    }
  }
  return verified;
}
