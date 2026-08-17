/**
 * Purpose: the `/t/{id}.json` half of the Discourse adapter — validate one topic payload and turn
 * it into the parts a candidate item is missing after RSS discovery: the whole first post (Discourse
 * ships it as `cooked` HTML), the author, and the reply count the ranking layer reads as a crowd
 * signal. The RSS description alone is only an excerpt.
 * Main exports: discourseTopicSchema, parseDiscourseTopic, extractDiscourseTopicId,
 * buildDiscourseTopicJsonUrl, applyDiscourseTopicDetail.
 */
import { z } from "zod";
import type { CandidateItem } from "./candidateItem";
import {
  firstNonEmptyText,
  resolveAbsoluteUrl,
  stripHtmlToPlainText,
  toIsoInstant,
} from "./feedText";
import { maximumSummaryLength } from "./genericFeedItemMapping";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

const optionalText = z.string().nullish();

const discoursePostSchema = z.object({
  /** The post body as rendered HTML — Discourse's own field name. */
  cooked: optionalText,
  username: optionalText,
  name: optionalText,
  created_at: optionalText,
});

export const discourseTopicSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  slug: optionalText,
  created_at: optionalText,
  /** Includes the opening post, so replies are one fewer. */
  posts_count: z.number().nonnegative().optional(),
  reply_count: z.number().nonnegative().optional(),
  image_url: optionalText,
  post_stream: z.object({ posts: z.array(discoursePostSchema).optional() }).optional(),
});

export type DiscourseTopic = z.infer<typeof discourseTopicSchema>;

export interface DiscourseTopicDetail {
  topicId: number;
  title: string;
  /** First post, HTML stripped and cut to the card limit. */
  summary: string;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  upstreamSignal: number;
}

function replyCountOf(topic: DiscourseTopic): number {
  if (topic.reply_count !== undefined) return topic.reply_count;
  if (topic.posts_count !== undefined) return Math.max(0, topic.posts_count - 1);
  return 0;
}

/** Returns null when the payload is not a Discourse topic — a Cloudflare interstitial, say. */
export function parseDiscourseTopic(
  payload: unknown,
  baseUrl: string,
): DiscourseTopicDetail | null {
  const parsed = discourseTopicSchema.safeParse(payload);
  if (!parsed.success) return null;
  const topic = parsed.data;
  const openingPost = topic.post_stream?.posts?.[0];
  const summary = stripHtmlToPlainText(openingPost?.cooked)
    .slice(0, maximumSummaryLength)
    .trimEnd();
  return {
    topicId: topic.id,
    title: stripHtmlToPlainText(topic.title) || topic.title,
    summary,
    author: firstNonEmptyText(openingPost?.name, openingPost?.username),
    coverUrl: resolveAbsoluteUrl(topic.image_url, baseUrl),
    publishedAt: toIsoInstant(firstNonEmptyText(topic.created_at, openingPost?.created_at)),
    upstreamSignal: normalizeCountToSignal(replyCountOf(topic), saturationCounts.discourseReplies),
  };
}

/** Topic addresses read `/t/{slug}/{id}` or `/t/{id}`, sometimes with a post number appended. */
export function extractDiscourseTopicId(topicUrl: string): number | null {
  let path: string;
  try {
    path = new URL(topicUrl).pathname;
  } catch {
    return null;
  }
  const match = /\/t\/(?:[^/]+\/)?(\d+)(?:\/|$)/.exec(path);
  if (!match?.[1]) return null;
  const topicId = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(topicId) && topicId > 0 ? topicId : null;
}

/**
 * Builds the topic JSON address from the forum's own feed address, so a forum installed under a
 * subfolder (`https://host/forum/latest.rss`) keeps its prefix.
 */
export function buildDiscourseTopicJsonUrl(feedUrl: string, topicId: number): string | null {
  try {
    return new URL(`t/${topicId}.json`, feedUrl).toString();
  } catch {
    return null;
  }
}

/** Overlays what the topic JSON knows onto the item RSS discovery produced, keeping its id so the
 * candidate pool still recognises it as the same thread. */
export function applyDiscourseTopicDetail(
  item: CandidateItem,
  detail: DiscourseTopicDetail,
): CandidateItem {
  return {
    ...item,
    title: detail.title || item.title,
    summary: detail.summary || item.summary,
    author: detail.author ?? item.author,
    coverUrl: detail.coverUrl ?? item.coverUrl,
    publishedAt: detail.publishedAt ?? item.publishedAt,
    upstreamSignal: detail.upstreamSignal,
  };
}
