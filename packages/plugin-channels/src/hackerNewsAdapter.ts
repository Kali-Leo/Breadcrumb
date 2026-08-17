/**
 * Purpose: the Hacker News adapter, over Algolia's search API — one endpoint that serves both jobs
 * this channel does: `tags=front_page` for the passive poll, and a free-text query for active
 * recall (spec 053 requirement 4). The survey found this the most cooperative channel of the lot
 * ("There is currently no rate limit" in HN's own documentation), so the only thing throttling it
 * is our own catalog policy.
 * Main exports: algoliaHitSchema, parseAlgoliaHits, fetchHackerNewsSource, searchHackerNews.
 */
import { z } from "zod";
import { type CandidateItem, parseCandidateItems } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import { firstNonEmptyText, stripHtmlToPlainText, toIsoInstant } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { maximumSummaryLength } from "./genericFeedItemMapping";
import { parseJsonPayload } from "./jsonPayload";
import { outcomeOnlyResult, type SourceFetchResult } from "./sourceFetchResult";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

const optionalText = z.string().nullish();

export const hackerNewsItemBaseUrl = "https://news.ycombinator.com/item?id=";

export const algoliaHitSchema = z.object({
  objectID: z.string().min(1),
  title: optionalText,
  /** Null on Ask HN and Show HN text posts, which live on the discussion page itself. */
  url: optionalText,
  author: optionalText,
  points: z.number().nullish(),
  num_comments: z.number().nullish(),
  created_at: optionalText,
  story_text: optionalText,
});

export type AlgoliaHit = z.infer<typeof algoliaHitSchema>;

export const algoliaResponseSchema = z.object({ hits: z.array(z.unknown()) });

/**
 * Every hit becomes a "discussion": the reader is going to the thread, and the thread is where the
 * comments are. A link post still carries its outside address, so the reading overlay can offer
 * the article too.
 */
function toCandidateDraft(hit: AlgoliaHit, sourceId: string, observedAtIso: string): unknown {
  const discussionUrl = `${hackerNewsItemBaseUrl}${hit.objectID}`;
  return {
    id: `${sourceId}:${hit.objectID}`,
    sourceId,
    kind: "discussion",
    url: firstNonEmptyText(hit.url) ?? discussionUrl,
    mediaUrl: null,
    title: stripHtmlToPlainText(hit.title),
    summary: stripHtmlToPlainText(hit.story_text).slice(0, maximumSummaryLength).trimEnd(),
    coverUrl: null,
    author: firstNonEmptyText(hit.author),
    publishedAt: toIsoInstant(hit.created_at) ?? observedAtIso,
    upstreamSignal: normalizeCountToSignal(hit.points ?? 0, saturationCounts.hackerNewsPoints),
  };
}

export interface AlgoliaParseResult {
  items: CandidateItem[];
  skippedEntryCount: number;
  parseError: string | null;
}

export function parseAlgoliaHits(
  sourceId: string,
  body: string,
  observedAt?: Date,
): AlgoliaParseResult {
  const payload = parseJsonPayload(body);
  if (!payload.ok) return { items: [], skippedEntryCount: 0, parseError: payload.error };
  const response = algoliaResponseSchema.safeParse(payload.value);
  if (!response.success) {
    return { items: [], skippedEntryCount: 0, parseError: "algolia response has no hits array" };
  }
  const observedAtIso = (observedAt ?? new Date()).toISOString();
  const drafts: unknown[] = [];
  let skippedEntryCount = 0;
  for (const entry of response.data.hits) {
    const hit = algoliaHitSchema.safeParse(entry);
    if (!hit.success) {
      skippedEntryCount += 1;
      continue;
    }
    drafts.push(toCandidateDraft(hit.data, sourceId, observedAtIso));
  }
  const parsed = parseCandidateItems(drafts);
  return {
    items: parsed.items,
    // Comment hits carry no title and drop out of the contract here, which is what we want.
    skippedEntryCount: skippedEntryCount + parsed.rejectedCount,
    parseError: null,
  };
}

export async function fetchHackerNewsSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, {
    kind: "poll",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  const parsed = parseAlgoliaHits(source.id, outcome.body, observedAt);
  return {
    sourceId: source.id,
    outcome,
    items: parsed.items,
    skippedEntryCount: parsed.skippedEntryCount,
    parseError: parsed.parseError,
    repairedFromTruncation: false,
    followUpRequestCount: 0,
  };
}

export interface HackerNewsSearchOptions {
  /** "search_by_date" is recency-first; "search" is Algolia's own relevance ranking. */
  ordering?: "by-date" | "by-relevance";
  hitsPerPage?: number;
  observedAt?: Date;
}

/** Built from the source's own address so a mirror or a changed API version stays in the catalog. */
export function buildHackerNewsSearchUrl(
  source: ChannelSource,
  query: string,
  options: HackerNewsSearchOptions = {},
): string {
  const path = options.ordering === "by-relevance" ? "search" : "search_by_date";
  const url = new URL(path, source.endpoint.feedUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(options.hitsPerPage ?? 20));
  return url.toString();
}

/** Returns fewer results rather than an error: a search that fails costs the reader nothing. */
export async function searchHackerNews(
  query: string,
  source: ChannelSource,
  context: FetchContext,
  options: HackerNewsSearchOptions = {},
): Promise<CandidateItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const outcome = await context.fetchUrl(buildHackerNewsSearchUrl(source, trimmed, options), {
    kind: "follow-up",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return [];
  return parseAlgoliaHits(source.id, outcome.body, options.observedAt).items;
}
