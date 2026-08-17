/**
 * Purpose: the Discourse adapter (linux.do and every other Discourse forum). Discovery goes
 * through `/latest.rss` because the survey measured `/latest.json` behind Cloudflare and
 * `/about.json` rate-limited at about six calls; the full post body and the reply count then come
 * from `/t/{id}.json` for the newest few topics, bounded by the catalog's fullTextTopicsPerPoll.
 * These forums 403 a library User-Agent, so the catalog entry carries a browser one.
 * Main exports: fetchDiscourseSource, parseDiscourseLatestFeed.
 */
import type { CandidateItem } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import {
  applyDiscourseTopicDetail,
  buildDiscourseTopicJsonUrl,
  extractDiscourseTopicId,
  parseDiscourseTopic,
} from "./discourseTopic";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { type FeedAdapterResult, parseFeedIntoCandidateItems } from "./genericFeedAdapter";
import { parseJsonPayload } from "./jsonPayload";
import {
  outcomeOnlyResult,
  resultFromFeedAdapter,
  type SourceFetchResult,
} from "./sourceFetchResult";

/** Threads are discussions whatever the catalog says, and the RSS excerpt is the fallback body. */
export function parseDiscourseLatestFeed(
  source: ChannelSource,
  fetched: { body: string; finalUrl: string },
  observedAt?: Date,
): FeedAdapterResult {
  return parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: "discussion",
    feedText: fetched.body,
    baseUrl: fetched.finalUrl,
    observedAt,
  });
}

interface EnrichmentTally {
  items: CandidateItem[];
  requestCount: number;
}

/**
 * Opens the newest topics one at a time. A topic that fails, rate-limits or comes back as
 * something other than a topic leaves its RSS-derived item untouched: a thinner card beats a lost
 * one, and the ranking layer already handles a null crowd signal.
 */
async function enrichNewestTopics(
  items: readonly CandidateItem[],
  source: ChannelSource,
  context: FetchContext,
  limit: number,
): Promise<EnrichmentTally> {
  const enriched = [...items];
  let requestCount = 0;
  for (let index = 0; index < enriched.length && requestCount < limit; index += 1) {
    const item = enriched[index];
    if (!item) continue;
    const topicId = extractDiscourseTopicId(item.url);
    if (topicId === null) continue;
    const topicUrl = buildDiscourseTopicJsonUrl(source.endpoint.feedUrl, topicId);
    if (topicUrl === null) continue;
    requestCount += 1;
    const outcome = await context.fetchUrl(topicUrl, {
      kind: "follow-up",
      accept: jsonAcceptHeader,
    });
    if (outcome.status !== "fetched") continue;
    const payload = parseJsonPayload(outcome.body);
    if (!payload.ok) continue;
    const detail = parseDiscourseTopic(payload.value, outcome.finalUrl);
    if (detail === null) continue;
    enriched[index] = applyDiscourseTopicDetail(item, detail);
  }
  return { items: enriched, requestCount };
}

export async function fetchDiscourseSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, { kind: "poll" });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);

  const parsed = parseDiscourseLatestFeed(source, outcome, observedAt);
  const result = resultFromFeedAdapter(source.id, outcome, parsed);
  const limit = source.endpoint.fullTextTopicsPerPoll ?? 0;
  if (limit === 0 || parsed.items.length === 0) return result;

  const tally = await enrichNewestTopics(parsed.items, source, context, limit);
  return { ...result, items: tally.items, followUpRequestCount: tally.requestCount };
}
