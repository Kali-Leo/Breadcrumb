/**
 * Purpose: the one entry point the discovery pipeline calls to poll a source, whichever channel it
 * is. Everything a caller needs to know is the catalog entry and the fetch context; which adapter
 * runs, how many requests it takes and how the payload is shaped stay in here.
 * Main exports: fetchLatestFromSource, fetchGenericFeedSource.
 */
import { adapterCapabilities } from "./adapterCapabilities";
import { fetchArxivSource } from "./arxivAdapter";
import { type ChannelSource, isSourceTemplate } from "./channelCatalog";
import { fetchDiscourseSource } from "./discourseAdapter";
import type { FetchContext } from "./fetchContract";
import { parseSourceFeed } from "./genericFeedAdapter";
import { fetchHackerNewsSource } from "./hackerNewsAdapter";
import {
  outcomeOnlyResult,
  resultFromFeedAdapter,
  type SourceFetchResult,
} from "./sourceFetchResult";
import { fetchV2exSource } from "./v2exAdapter";
import { fetchYoutubeChannelSource } from "./youtubeChannelAdapter";

/** RSS, RDF, Atom or JSON Feed at one address — the path most of the catalog takes, and the one
 * 豆瓣's user-activity feed takes once the reader has supplied their id. */
export async function fetchGenericFeedSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, { kind: "poll" });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  return resultFromFeedAdapter(source.id, outcome, parseSourceFeed(source, outcome, observedAt));
}

/**
 * Polls one source. Never throws and never reports an error upward: an unreachable source, a
 * source out of budget, a source whose payload turned out to be a login page — all of them come
 * back as a result with no items, because the feed the reader sees must not depend on every
 * channel being up (spec 053: "不可达静默跳过，不报错不占位").
 */
export async function fetchLatestFromSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  if (isSourceTemplate(source)) {
    return outcomeOnlyResult(source.id, { status: "skipped", reason: "template-not-filled" });
  }
  if (!adapterCapabilities[source.adapterType].poll) {
    return outcomeOnlyResult(source.id, { status: "skipped", reason: "not-pollable" });
  }
  switch (source.adapterType) {
    case "discourse":
      return fetchDiscourseSource(source, context, observedAt);
    case "v2ex":
      return fetchV2exSource(source, context, observedAt);
    case "hackernews":
      return fetchHackerNewsSource(source, context, observedAt);
    case "arxiv":
      return fetchArxivSource(source, context, { observedAt });
    case "youtube-channel":
      return fetchYoutubeChannelSource(source, context, observedAt);
    default:
      return fetchGenericFeedSource(source, context, observedAt);
  }
}
