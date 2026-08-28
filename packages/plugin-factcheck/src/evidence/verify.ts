/**
 * Purpose: fetch-and-verify, shared by the two HTML-scraping providers — never surface a
 * link we could not open ourselves, and keep the body we just paid for as judging material
 * instead of throwing it away. Main exports: ResultCandidate, verifyCandidates.
 */
import { extractKeywordWindow } from "./pageText";
import type { EvidenceItem, FetchLike } from "./provider";

/** A parsed search result, before we know whether its page can actually be opened. */
export interface ResultCandidate {
  url: string;
  title: string;
  /** The search engine's own summary — the fallback when the page body yields no window. */
  snippet: string;
}

export interface VerifyOutcome {
  items: EvidenceItem[];
  /** True when candidates existed but not one page could be opened. That is a reachability
   * failure on our side, not evidence that the claim is unsupported (差距 2). */
  failed: boolean;
}

export async function verifyCandidates(
  fetchImpl: FetchLike,
  timeoutMs: number,
  candidates: readonly ResultCandidate[],
  limit: number,
  source: string,
  query: string,
): Promise<VerifyOutcome> {
  const items: EvidenceItem[] = [];
  for (const candidate of candidates) {
    if (items.length >= limit) break;
    try {
      const response = await fetchImpl(candidate.url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) continue;
      const window = extractKeywordWindow(await response.text(), query);
      items.push({ ...candidate, snippet: window ?? candidate.snippet, source });
    } catch {
      // Unreachable page: never surface a link we could not open ourselves.
    }
  }
  return { items, failed: candidates.length > 0 && items.length === 0 };
}
