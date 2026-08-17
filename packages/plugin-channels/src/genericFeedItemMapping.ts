/**
 * Purpose: turn one validated feed entry — RSS/RDF item, Atom entry, or JSON Feed item — into a
 * candidate-item draft. Cover art comes from enclosures, the media namespace or the iTunes image,
 * never from an extra request; upstreamSignal is null because plain feeds publish no crowd number.
 * Main exports: mapRssItem, mapAtomEntry, mapJsonFeedItem, FeedItemMappingContext.
 */
import type { CandidateItemKind } from "./candidateItem";
import type { AtomEntry, JsonFeedItem, RssItem } from "./feedSchemas";
import {
  firstNonEmptyText,
  resolveAbsoluteUrl,
  stripHtmlToPlainText,
  toIsoInstant,
} from "./feedText";

/** Cards show a snippet; feeds that inline the whole article would otherwise bloat every row. */
export const maximumSummaryLength = 2000;

export interface FeedItemMappingContext {
  sourceId: string;
  /** Used for entries the payload does not classify itself. */
  defaultKind: CandidateItemKind;
  /** Post-redirect feed address, so relative links resolve correctly. */
  baseUrl: string;
  /** Stands in for a missing publication date. */
  observedAtIso: string;
}

interface MediaLike {
  thumbnails?: ReadonlyArray<{ url?: string }>;
  contents?: ReadonlyArray<{ url?: string; type?: string; medium?: string }>;
  group?: {
    thumbnails?: ReadonlyArray<{ url?: string }>;
    contents?: ReadonlyArray<{ url?: string; type?: string; medium?: string }>;
  };
  groups?: ReadonlyArray<{
    thumbnails?: ReadonlyArray<{ url?: string }>;
    contents?: ReadonlyArray<{ url?: string; type?: string; medium?: string }>;
  }>;
}

interface AttachmentLike {
  url?: string;
  type?: string;
}

function shorten(text: string): string {
  return text.length > maximumSummaryLength ? text.slice(0, maximumSummaryLength).trimEnd() : text;
}

function imageUrlFromMedia(media: MediaLike | undefined): string | null {
  if (!media) return null;
  const group = media.group ?? media.groups?.[0];
  const thumbnails = media.thumbnails ?? group?.thumbnails;
  const contents = media.contents ?? group?.contents;
  const imageContent = contents?.find(
    (content) => content.medium === "image" || content.type?.startsWith("image/"),
  );
  return firstNonEmptyText(thumbnails?.[0]?.url, imageContent?.url);
}

function imageUrlFromAttachments(attachments: ReadonlyArray<AttachmentLike>): string | null {
  return firstNonEmptyText(attachments.find((one) => one.type?.startsWith("image/"))?.url);
}

/** An audio or video enclosure is the strongest statement a feed makes about its own kind. */
function kindFromAttachments(
  attachments: ReadonlyArray<AttachmentLike>,
  defaultKind: CandidateItemKind,
): CandidateItemKind {
  for (const attachment of attachments) {
    if (attachment.type?.startsWith("audio/")) return "podcast";
    if (attachment.type?.startsWith("video/")) return "video";
  }
  return defaultKind;
}

interface CandidateDraft {
  id: string;
  sourceId: string;
  kind: CandidateItemKind;
  url: string | null;
  title: string;
  summary: string;
  coverUrl: string | null;
  author: string | null;
  publishedAt: string;
  upstreamSignal: null;
}

function assembleDraft(
  context: FeedItemMappingContext,
  parts: {
    identity: string | null;
    url: string | null;
    rawTitle: string | null;
    rawSummary: string | null;
    coverUrl: string | null;
    author: string | null;
    rawDate: string | null;
    kind: CandidateItemKind;
  },
): CandidateDraft {
  const summary = shorten(stripHtmlToPlainText(parts.rawSummary));
  const title = stripHtmlToPlainText(parts.rawTitle) || summary.slice(0, 80);
  const identity = parts.identity ?? parts.url ?? title;
  return {
    id: `${context.sourceId}:${identity}`,
    sourceId: context.sourceId,
    kind: parts.kind,
    url: parts.url,
    title,
    summary,
    coverUrl: resolveAbsoluteUrl(parts.coverUrl, context.baseUrl),
    author: parts.author,
    publishedAt: toIsoInstant(parts.rawDate) ?? context.observedAtIso,
    upstreamSignal: null,
  };
}

export function mapRssItem(item: RssItem, context: FeedItemMappingContext): CandidateDraft {
  const enclosures = item.enclosures ?? [];
  const permalinkGuid = item.guid?.isPermaLink === false ? null : item.guid?.value;
  return assembleDraft(context, {
    identity: firstNonEmptyText(item.guid?.value, item.link),
    url: resolveAbsoluteUrl(firstNonEmptyText(item.link, permalinkGuid), context.baseUrl),
    rawTitle: firstNonEmptyText(item.title),
    rawSummary: firstNonEmptyText(item.description, item.content?.encoded),
    coverUrl: firstNonEmptyText(
      enclosures.find((one) => one.type?.startsWith("image/"))?.url,
      imageUrlFromMedia(item.media),
      item.itunes?.image,
    ),
    author: firstNonEmptyText(
      item.authors?.[0],
      item.dc?.creator,
      item.dc?.creators?.[0],
      item.itunes?.author,
    ),
    rawDate: firstNonEmptyText(item.pubDate, item.dc?.date, item.dc?.dates?.[0]),
    kind: kindFromAttachments(enclosures, context.defaultKind),
  });
}

export function mapAtomEntry(entry: AtomEntry, context: FeedItemMappingContext): CandidateDraft {
  const links = entry.links ?? [];
  const alternate = links.find((link) => link.rel === "alternate" || link.rel === undefined);
  const enclosures = links
    .filter((link) => link.rel === "enclosure")
    .map((link) => ({ url: link.href, type: link.type }));
  return assembleDraft(context, {
    identity: firstNonEmptyText(entry.id, alternate?.href),
    url: resolveAbsoluteUrl(firstNonEmptyText(alternate?.href, links[0]?.href), context.baseUrl),
    rawTitle: firstNonEmptyText(entry.title),
    rawSummary: firstNonEmptyText(entry.summary, entry.content),
    coverUrl: firstNonEmptyText(
      imageUrlFromAttachments(enclosures),
      imageUrlFromMedia(entry.media),
      entry.itunes?.image,
    ),
    author: firstNonEmptyText(entry.authors?.[0]?.name, entry.dc?.creator, entry.itunes?.author),
    rawDate: firstNonEmptyText(entry.published, entry.updated, entry.dc?.date),
    kind: kindFromAttachments(enclosures, context.defaultKind),
  });
}

export function mapJsonFeedItem(
  item: JsonFeedItem,
  context: FeedItemMappingContext,
): CandidateDraft {
  const attachments = (item.attachments ?? []).map((one) => ({
    url: one.url,
    type: one.mime_type,
  }));
  return assembleDraft(context, {
    identity: firstNonEmptyText(item.id, item.url),
    url: resolveAbsoluteUrl(firstNonEmptyText(item.url, item.external_url), context.baseUrl),
    rawTitle: firstNonEmptyText(item.title),
    rawSummary: firstNonEmptyText(item.summary, item.content_text, item.content_html),
    coverUrl: firstNonEmptyText(
      item.image,
      item.banner_image,
      imageUrlFromAttachments(attachments),
    ),
    author: firstNonEmptyText(item.authors?.[0]?.name),
    rawDate: firstNonEmptyText(item.date_published, item.date_modified),
    kind: kindFromAttachments(attachments, context.defaultKind),
  });
}
