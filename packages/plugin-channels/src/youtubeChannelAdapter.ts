/**
 * Purpose: the YouTube adapter. A channel's public feed
 * (`/feeds/videos.xml?channel_id=…`) is ordinary Atom with the media namespace, so the generic
 * parser reads it — this file pins the video kind and holds the two YouTube-specific pieces: the
 * feed address for a channel id, and oEmbed, which the survey measured as costing no Data API
 * quota and which gives title, channel name and thumbnail for a bare video address.
 * Main exports: buildYoutubeChannelFeedUrl, fetchYoutubeChannelSource, fetchYoutubeOEmbed.
 */

import { z } from "zod";
import type { ChannelSource } from "./channelCatalog";
import { firstNonEmptyText } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { type FeedAdapterResult, parseFeedIntoCandidateItems } from "./genericFeedAdapter";
import { parseJsonPayload } from "./jsonPayload";
import {
  outcomeOnlyResult,
  resultFromFeedAdapter,
  type SourceFetchResult,
} from "./sourceFetchResult";

export const youtubeChannelFeedBaseUrl = "https://www.youtube.com/feeds/videos.xml";

export const youtubeOEmbedBaseUrl = "https://www.youtube.com/oembed";

/** For the reader who pastes a channel id in settings rather than a full feed address. */
export function buildYoutubeChannelFeedUrl(channelId: string): string {
  const url = new URL(youtubeChannelFeedBaseUrl);
  url.searchParams.set("channel_id", channelId);
  return url.toString();
}

export function parseYoutubeChannelFeed(
  source: ChannelSource,
  fetched: { body: string; finalUrl: string },
  observedAt?: Date,
): FeedAdapterResult {
  return parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: "video",
    feedText: fetched.body,
    baseUrl: fetched.finalUrl,
    observedAt,
  });
}

export async function fetchYoutubeChannelSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, { kind: "poll" });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  return resultFromFeedAdapter(
    source.id,
    outcome,
    parseYoutubeChannelFeed(source, outcome, observedAt),
  );
}

export const youtubeOEmbedSchema = z.object({
  title: z.string().nullish(),
  author_name: z.string().nullish(),
  author_url: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  provider_name: z.string().nullish(),
});

export interface YoutubeVideoPreview {
  title: string | null;
  channelName: string | null;
  channelUrl: string | null;
  thumbnailUrl: string | null;
}

export function buildYoutubeOEmbedUrl(videoUrl: string, oembedBaseUrl?: string): string {
  const url = new URL(oembedBaseUrl ?? youtubeOEmbedBaseUrl);
  url.searchParams.set("url", videoUrl);
  url.searchParams.set("format", "json");
  return url.toString();
}

export interface YoutubeOEmbedOptions {
  /** Overrides the endpoint; the same request shape serves Vimeo and other oEmbed providers. */
  oembedBaseUrl?: string;
}

/**
 * Fills in title and cover for a video we only have an address for — a link someone shared, or a
 * forum thread pointing at YouTube. Returns null rather than throwing when the video is private,
 * removed, or simply unreachable from where the reader is sitting. This asks for a thumbnail
 * address, not the image itself, so it is safe under data saver.
 */
export async function fetchYoutubeOEmbed(
  videoUrl: string,
  context: FetchContext,
  options: YoutubeOEmbedOptions = {},
): Promise<YoutubeVideoPreview | null> {
  const outcome = await context.fetchUrl(buildYoutubeOEmbedUrl(videoUrl, options.oembedBaseUrl), {
    kind: "follow-up",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return null;
  const payload = parseJsonPayload(outcome.body);
  if (!payload.ok) return null;
  const parsed = youtubeOEmbedSchema.safeParse(payload.value);
  if (!parsed.success) return null;
  return {
    title: firstNonEmptyText(parsed.data.title),
    channelName: firstNonEmptyText(parsed.data.author_name),
    channelUrl: firstNonEmptyText(parsed.data.author_url),
    thumbnailUrl: firstNonEmptyText(parsed.data.thumbnail_url),
  };
}
