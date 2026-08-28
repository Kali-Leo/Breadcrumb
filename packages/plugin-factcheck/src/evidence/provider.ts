/**
 * Purpose: the evidence-source contract — provider interface, evidence item shape, and a
 * small HTML-to-text helper shared by concrete providers.
 * Main exports: EvidenceProvider, EvidenceItem, EvidenceSearchResult, FetchLike, stripHtml.
 */

/** Injected fetch so the headless package stays free of platform networking choices. */
export type FetchLike = typeof fetch;

/** Blocked networks (e.g. walled endpoints in mainland China) hang instead of failing,
 * so every provider request must time out fast and let the pipeline fall through. */
export const DEFAULT_TIMEOUT_MS = 8000;

export interface EvidenceItem {
  /** Link already verified accessible (fetch-and-verify) before being surfaced. */
  url: string;
  title: string;
  /** Plain-text judging material: the window of the fetched page body around the query
   * terms where one is available, otherwise the search engine's own summary. */
  snippet: string;
  /** Provider name, e.g. "wikipedia". */
  source: string;
}

/**
 * What one provider search produced. `failed` is the whole point of this wrapper: a search
 * that never completed (blocked network, non-OK response, markup drift, not one candidate
 * page openable) says nothing whatsoever about whether public evidence exists, and the
 * pipeline must not report it as "no evidence found" (深度设计审计 2026-08-28, 差距 2).
 */
export interface EvidenceSearchResult {
  items: EvidenceItem[];
  /** True only when the search itself did not complete — never for a completed search
   * that legitimately returned nothing. */
  failed: boolean;
}

export interface EvidenceProvider {
  name: string;
  /** Returns up to `limit` verified evidence items. Must swallow its own errors, reporting
   * them through `failed` rather than throwing. */
  search(query: string, limit: number): Promise<EvidenceSearchResult>;
}

const ENTITY_MAP: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  const withoutTags = html.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags.replace(
    /&amp;|&lt;|&gt;|&quot;|&#x27;|&#39;|&nbsp;/g,
    (entity) => ENTITY_MAP[entity] ?? entity,
  );
  return decoded.replace(/\s+/g, " ").trim();
}
