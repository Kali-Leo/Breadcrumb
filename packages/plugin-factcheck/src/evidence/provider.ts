/**
 * Purpose: the evidence-source contract — provider interface, evidence item shape, and a
 * small HTML-to-text helper shared by concrete providers.
 * Main exports: EvidenceProvider, EvidenceItem, FetchLike, stripHtml.
 */

/** Injected fetch so the headless package stays free of platform networking choices. */
export type FetchLike = typeof fetch;

export interface EvidenceItem {
  /** Link already verified accessible (fetch-and-verify) before being surfaced. */
  url: string;
  title: string;
  /** Plain-text excerpt used as judging material and shown to the learner. */
  snippet: string;
  /** Provider name, e.g. "wikipedia". */
  source: string;
}

export interface EvidenceProvider {
  name: string;
  /** Returns up to `limit` verified evidence items; must swallow its own errors and return []. */
  search(query: string, limit: number): Promise<EvidenceItem[]>;
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
