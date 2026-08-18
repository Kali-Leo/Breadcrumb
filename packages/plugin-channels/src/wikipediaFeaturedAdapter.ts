/**
 * Purpose: Wikipedia's featured-content feed, the one daily source that is neither news nor a
 * blog. The address carries the date, so the adapter fills it in rather than the reader: one poll
 * asks for one day. The 2026-08-18 survey measured the Chinese edition answering anonymously with
 * 48 most-read articles, 39 of them carrying a thumbnail, plus the picture of the day — which is
 * why this is worth its own small adapter in a catalog that was short of pictures.
 * Main exports: wikipediaFeaturedUrlTemplate, buildWikipediaFeaturedUrl, parseWikipediaFeatured,
 * fetchWikipediaFeaturedSource.
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

/** `{year}/{month}/{day}` are filled in by the adapter, not by the reader — this is not a
 * settings template, so the entry stays pollable as it ships. */
export const wikipediaFeaturedUrlTemplate =
  "https://api.wikimedia.org/feed/v1/wikipedia/zh/featured/{year}/{month}/{day}";

/**
 * The day the feed is asked for, as UTC midnight — the calendar Wikimedia builds the feed on. The
 * day before the observed one is used deliberately: "today" is only complete once the day is over,
 * and just after UTC midnight it does not exist yet.
 */
export function wikipediaFeaturedDay(observedAt: Date): Date {
  const day = new Date(observedAt.getTime() - 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
}

export function buildWikipediaFeaturedUrl(template: string, observedAt: Date): string {
  const day = wikipediaFeaturedDay(observedAt);
  return template
    .replace("{year}", String(day.getUTCFullYear()))
    .replace("{month}", `${day.getUTCMonth() + 1}`.padStart(2, "0"))
    .replace("{day}", `${day.getUTCDate()}`.padStart(2, "0"));
}

const optionalText = z.string().nullish();

const thumbnailSchema = z.object({ source: optionalText }).nullish();

const mostReadArticleSchema = z.object({
  title: z.string().min(1),
  titles: z.object({ normalized: optionalText }).nullish(),
  extract: optionalText,
  description: optionalText,
  thumbnail: thumbnailSchema,
  views: z.number().nonnegative().nullish(),
  content_urls: z.object({ desktop: z.object({ page: optionalText }).nullish() }).nullish(),
});

const pictureOfTheDaySchema = z.object({
  title: optionalText,
  thumbnail: thumbnailSchema,
  file_page: optionalText,
  description: z.object({ text: optionalText }).nullish(),
});

export const wikipediaFeaturedSchema = z.object({
  mostread: z.object({ articles: z.array(z.unknown()).nullish() }).nullish(),
  image: z.unknown().nullish(),
});

function toArticleDraft(
  article: z.infer<typeof mostReadArticleSchema>,
  sourceId: string,
  publishedAtIso: string,
): unknown {
  const summary = stripHtmlToPlainText(
    firstNonEmptyText(article.extract, article.description) ?? "",
  );
  return {
    id: `${sourceId}:${article.title}`,
    sourceId,
    kind: "article",
    url: firstNonEmptyText(article.content_urls?.desktop?.page),
    mediaUrl: null,
    title: stripHtmlToPlainText(firstNonEmptyText(article.titles?.normalized, article.title) ?? ""),
    summary: summary.slice(0, maximumSummaryLength).trimEnd(),
    coverUrl: firstNonEmptyText(article.thumbnail?.source),
    author: null,
    publishedAt: publishedAtIso,
    upstreamSignal: normalizeCountToSignal(
      article.views ?? 0,
      saturationCounts.wikipediaDailyViews,
    ),
  };
}

/** The picture of the day is one card, and the only one here whose whole point is the picture. */
function toPictureDraft(value: unknown, sourceId: string, publishedAtIso: string): unknown | null {
  const parsed = pictureOfTheDaySchema.safeParse(value);
  if (!parsed.success) return null;
  const cover = firstNonEmptyText(parsed.data.thumbnail?.source);
  const page = firstNonEmptyText(parsed.data.file_page);
  if (cover === null || page === null) return null;
  const caption = stripHtmlToPlainText(parsed.data.description?.text ?? "");
  const title = firstNonEmptyText(parsed.data.title)?.replace(/^File:/i, "") ?? "";
  return {
    id: `${sourceId}:picture-of-the-day:${publishedAtIso.slice(0, 10)}`,
    sourceId,
    kind: "article",
    url: page,
    mediaUrl: null,
    title: caption.slice(0, 120).trimEnd() || stripHtmlToPlainText(title),
    summary: caption.slice(0, maximumSummaryLength).trimEnd(),
    coverUrl: cover,
    author: null,
    publishedAt: publishedAtIso,
    upstreamSignal: null,
  };
}

export interface WikipediaFeaturedParseResult {
  items: CandidateItem[];
  skippedEntryCount: number;
  parseError: string | null;
}

/**
 * The feed states no per-article timestamp — the day is the whole point of it — so every card
 * carries the day it was featured, which is the instant the reader would recognize.
 */
export function parseWikipediaFeatured(
  sourceId: string,
  body: string,
  featuredDay: Date,
): WikipediaFeaturedParseResult {
  const payload = parseJsonPayload(body);
  if (!payload.ok) return { items: [], skippedEntryCount: 0, parseError: payload.error };
  const parsed = wikipediaFeaturedSchema.safeParse(payload.value);
  if (!parsed.success) {
    return { items: [], skippedEntryCount: 0, parseError: "not a Wikipedia featured feed" };
  }

  const publishedAtIso = featuredDay.toISOString();
  const drafts: unknown[] = [];
  let skippedEntryCount = 0;
  const picture = toPictureDraft(parsed.data.image, sourceId, publishedAtIso);
  if (picture !== null) drafts.push(picture);
  for (const raw of parsed.data.mostread?.articles ?? []) {
    const article = mostReadArticleSchema.safeParse(raw);
    if (!article.success) {
      skippedEntryCount += 1;
      continue;
    }
    // A most-read entry with no picture is a plain text card, which is the thing this whole
    // expansion exists to stop shipping; the article is still reachable through search.
    if (firstNonEmptyText(article.data.thumbnail?.source) === null) {
      skippedEntryCount += 1;
      continue;
    }
    drafts.push(toArticleDraft(article.data, sourceId, publishedAtIso));
  }
  const result = parseCandidateItems(drafts);
  return {
    items: result.items,
    skippedEntryCount: skippedEntryCount + result.rejectedCount,
    parseError: null,
  };
}

export async function fetchWikipediaFeaturedSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const now = observedAt ?? new Date();
  const url = buildWikipediaFeaturedUrl(source.endpoint.feedUrl, now);
  const outcome = await context.fetchUrl(url, { kind: "poll", accept: jsonAcceptHeader });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  const parsed = parseWikipediaFeatured(source.id, outcome.body, wikipediaFeaturedDay(now));
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
