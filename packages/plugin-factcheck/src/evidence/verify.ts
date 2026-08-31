/**
 * Purpose: fetch-and-verify, shared by the two HTML-scraping providers — never surface a
 * link we could not open ourselves, and keep the body we just paid for as judging material
 * instead of throwing it away. Main exports: ResultCandidate, verifyCandidates.
 */
import { extractKeywordWindow } from "./pageText";
import type { EvidenceItem, FetchLike } from "./provider";
import { fetchExternalPage } from "./safeFetch";

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
    // Search results are attacker-influenceable input and these fetches run in Rust, outside
    // the browser's private-network protections — fetchExternalPage refuses loopback and
    // private addresses and caps how much body it will read.
    const html = await fetchExternalPage(fetchImpl, candidate.url, timeoutMs);
    if (html === null) continue; // unreachable, refused, or unusable: never surface it
    const window = extractKeywordWindow(html, query);
    items.push({ ...candidate, snippet: window ?? candidate.snippet, source });
  }
  return { items, failed: candidates.length > 0 && items.length === 0 };
}
