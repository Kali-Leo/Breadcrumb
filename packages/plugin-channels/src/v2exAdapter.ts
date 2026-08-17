/**
 * Purpose: the V2EX adapter. The survey measured the anonymous v1 API answering 200 for the hot
 * and latest topic lists, sharing 600 requests per hour per IP with everything else on that IP, so
 * the catalog entries poll it gently. The topic body arrives with the list, which is why this
 * channel needs no follow-up request at all.
 * Main exports: v2exTopicSchema, parseV2exTopics, fetchV2exSource, v2exSiteBaseUrl.
 */
import { z } from "zod";
import { type CandidateItem, parseCandidateItems } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import { firstNonEmptyText, stripHtmlToPlainText } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { maximumSummaryLength } from "./genericFeedItemMapping";
import { parseJsonPayload } from "./jsonPayload";
import { outcomeOnlyResult, type SourceFetchResult } from "./sourceFetchResult";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

/** Stands in when a topic arrives without its own address: threads live at `/t/{id}`. */
export const v2exSiteBaseUrl = "https://www.v2ex.com/";

const optionalText = z.string().nullish();

export const v2exTopicSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  url: optionalText,
  /** Markdown source of the opening post. */
  content: optionalText,
  content_rendered: optionalText,
  replies: z.number().nonnegative().optional(),
  /** Unix seconds. */
  created: z.number().nonnegative().optional(),
  member: z.object({ username: optionalText }).nullish(),
  node: z.object({ title: optionalText, name: optionalText }).nullish(),
});

export type V2exTopic = z.infer<typeof v2exTopicSchema>;

function toCandidateDraft(topic: V2exTopic, sourceId: string, observedAtIso: string): unknown {
  const summaryText = stripHtmlToPlainText(
    firstNonEmptyText(topic.content, topic.content_rendered) ?? "",
  );
  return {
    id: `${sourceId}:${topic.id}`,
    sourceId,
    kind: "discussion",
    url: firstNonEmptyText(topic.url) ?? `${v2exSiteBaseUrl}t/${topic.id}`,
    mediaUrl: null,
    title: stripHtmlToPlainText(topic.title) || topic.title,
    summary: summaryText.slice(0, maximumSummaryLength).trimEnd(),
    // A member avatar is not a picture of the thread; leaving this null keeps the "has a real
    // cover" ranking feature honest.
    coverUrl: null,
    author: firstNonEmptyText(topic.member?.username),
    publishedAt:
      topic.created === undefined ? observedAtIso : new Date(topic.created * 1000).toISOString(),
    upstreamSignal: normalizeCountToSignal(topic.replies ?? 0, saturationCounts.v2exReplies),
  };
}

export interface V2exParseResult {
  items: CandidateItem[];
  skippedEntryCount: number;
  parseError: string | null;
}

/** Takes the raw response text so a Cloudflare page or a truncated body fails here, not upstream. */
export function parseV2exTopics(
  sourceId: string,
  body: string,
  observedAt?: Date,
): V2exParseResult {
  const payload = parseJsonPayload(body);
  if (!payload.ok) return { items: [], skippedEntryCount: 0, parseError: payload.error };
  const topics = z.array(z.unknown()).safeParse(payload.value);
  if (!topics.success) {
    return { items: [], skippedEntryCount: 0, parseError: "v2ex response is not a topic list" };
  }
  const observedAtIso = (observedAt ?? new Date()).toISOString();
  const drafts: unknown[] = [];
  let skippedEntryCount = 0;
  for (const entry of topics.data) {
    const topic = v2exTopicSchema.safeParse(entry);
    if (!topic.success) {
      skippedEntryCount += 1;
      continue;
    }
    drafts.push(toCandidateDraft(topic.data, sourceId, observedAtIso));
  }
  const parsed = parseCandidateItems(drafts);
  return {
    items: parsed.items,
    skippedEntryCount: skippedEntryCount + parsed.rejectedCount,
    parseError: null,
  };
}

export async function fetchV2exSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, {
    kind: "poll",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  const parsed = parseV2exTopics(source.id, outcome.body, observedAt);
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
