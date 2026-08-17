/**
 * Purpose: the arXiv adapter, doing both of this channel's jobs — the daily category RSS for the
 * passive poll (its description already carries the whole abstract, so a card costs no second
 * request) and the query API for active recall. arXiv's Terms of Use ask for no more than one
 * request every three seconds; the survey recorded arXiv's own documents contradicting each other
 * on this, and the decision recorded there is to obey the stricter number. Every request in this
 * file, poll or search, goes through one shared pacer that enforces it across all arXiv entries.
 * Main exports: arxivRequestPacer, fetchArxivSource, searchArxiv, cleanArxivItem.
 */
import type { CandidateItem } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import type { FetchContext } from "./fetchContract";
import { parseFeedIntoCandidateItems } from "./genericFeedAdapter";
import { RequestPacer } from "./requestPacer";
import {
  outcomeOnlyResult,
  resultFromFeedAdapter,
  type SourceFetchResult,
} from "./sourceFetchResult";

/** The API entry point. arXiv publishes it over plain HTTP; HTTPS also answers and is what we ask
 * for, because the payload passes through whatever network the reader is on. */
export const arxivApiQueryUrl = "https://export.arxiv.org/api/query";

export const arxivMinimumIntervalMilliseconds = 3_000;

/** Shared by every arXiv source, because the limit is on the client, not on the catalog entry. */
export const arxivRequestPacer = new RequestPacer({
  minimumIntervalMilliseconds: arxivMinimumIntervalMilliseconds,
});

/** RSS titles end with the identifier — "Some Title (arXiv:2508.01234v1 [cs.AI])" — and the
 * description opens with a machine preamble. Both are noise on a card. */
const titleIdentifierSuffix = /\s*\(arXiv:[^)]*\)\s*$/;
const summaryPreamble = /^\s*arXiv:\S+\s*(?:Announce Type:\s*\S+)?\s*(?:Abstract:\s*)?/i;

export function cleanArxivItem(item: CandidateItem): CandidateItem {
  const title = item.title.replace(titleIdentifierSuffix, "").trim();
  const summary = item.summary.replace(summaryPreamble, "").trim();
  return { ...item, kind: "paper", title: title || item.title, summary };
}

export interface ArxivRequestOptions {
  /** Swapped in tests for a pacer that does not sleep in real time. */
  pacer?: RequestPacer;
  observedAt?: Date;
}

export async function fetchArxivSource(
  source: ChannelSource,
  context: FetchContext,
  options: ArxivRequestOptions = {},
): Promise<SourceFetchResult> {
  const pacer = options.pacer ?? arxivRequestPacer;
  const outcome = await pacer.run(() =>
    context.fetchUrl(source.endpoint.feedUrl, { kind: "poll" }),
  );
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  const parsed = parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: "paper",
    feedText: outcome.body,
    baseUrl: outcome.finalUrl,
    observedAt: options.observedAt,
  });
  const result = resultFromFeedAdapter(source.id, outcome, parsed);
  return { ...result, items: parsed.items.map(cleanArxivItem) };
}

export interface ArxivSearchOptions extends ArxivRequestOptions {
  maximumResults?: number;
  /** Overrides the API entry point; the catalog holds category feeds, not the query endpoint. */
  apiQueryUrl?: string;
}

/** Newest first, phrase-quoted so a multi-word interest is not scattered across fields. */
export function buildArxivSearchUrl(query: string, options: ArxivSearchOptions = {}): string {
  const url = new URL(options.apiQueryUrl ?? arxivApiQueryUrl);
  url.searchParams.set("search_query", `all:"${query.replaceAll('"', "")}"`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(options.maximumResults ?? 20));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url.toString();
}

/**
 * Answers with fewer results rather than an error. The Atom the query API returns is ordinary
 * Atom — `<summary>` is the abstract — so the generic parser reads it and only the paper kind and
 * the title cleanup are arXiv-specific.
 */
export async function searchArxiv(
  query: string,
  source: ChannelSource,
  context: FetchContext,
  options: ArxivSearchOptions = {},
): Promise<CandidateItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pacer = options.pacer ?? arxivRequestPacer;
  const searchUrl = buildArxivSearchUrl(trimmed, options);
  const outcome = await pacer.run(() => context.fetchUrl(searchUrl, { kind: "follow-up" }));
  if (outcome.status !== "fetched") return [];
  const parsed = parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: "paper",
    feedText: outcome.body,
    baseUrl: outcome.finalUrl,
    observedAt: options.observedAt,
  });
  return parsed.items.map(cleanArxivItem);
}
