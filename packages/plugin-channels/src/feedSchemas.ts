/**
 * Purpose: Zod shapes for what feedsmith hands back. Its parser returns deeply optional objects
 * built from arbitrary XML, so every field the adapter reads is revalidated here before use, and
 * entries are validated one at a time — a single malformed <item> must not cost the whole feed.
 * Main exports: parsedFeedEnvelopeSchema, rssItemSchema, atomEntrySchema, jsonFeedItemSchema.
 */
import { z } from "zod";

const optionalText = z.string().optional();

const mediaThumbnailSchema = z.object({ url: optionalText });

const mediaContentSchema = z.object({
  url: optionalText,
  type: optionalText,
  medium: optionalText,
});

const mediaGroupSchema = z.object({
  thumbnails: z.array(mediaThumbnailSchema).optional(),
  contents: z.array(mediaContentSchema).optional(),
});

/** media: RSS, both at item level and inside <media:group> (YouTube's layout). */
export const mediaNamespaceSchema = z.object({
  thumbnails: z.array(mediaThumbnailSchema).optional(),
  contents: z.array(mediaContentSchema).optional(),
  group: mediaGroupSchema.optional(),
  groups: z.array(mediaGroupSchema).optional(),
});

export const itunesItemSchema = z.object({
  image: optionalText,
  author: optionalText,
});

export const dublinCoreSchema = z.object({
  creator: optionalText,
  creators: z.array(z.string()).optional(),
  date: optionalText,
  dates: z.array(z.string()).optional(),
});

export const enclosureSchema = z.object({
  url: optionalText,
  type: optionalText,
  length: z.number().optional(),
});

export const rssItemSchema = z.object({
  title: optionalText,
  link: optionalText,
  description: optionalText,
  authors: z.array(z.string()).optional(),
  enclosures: z.array(enclosureSchema).optional(),
  guid: z.object({ value: optionalText, isPermaLink: z.boolean().optional() }).optional(),
  pubDate: optionalText,
  content: z.object({ encoded: optionalText }).optional(),
  dc: dublinCoreSchema.optional(),
  itunes: itunesItemSchema.optional(),
  media: mediaNamespaceSchema.optional(),
});

export type RssItem = z.infer<typeof rssItemSchema>;

const atomLinkSchema = z.object({
  href: optionalText,
  rel: optionalText,
  type: optionalText,
  length: z.number().optional(),
});

export const atomEntrySchema = z.object({
  id: optionalText,
  title: optionalText,
  summary: optionalText,
  content: optionalText,
  links: z.array(atomLinkSchema).optional(),
  authors: z.array(z.object({ name: optionalText })).optional(),
  published: optionalText,
  updated: optionalText,
  dc: dublinCoreSchema.optional(),
  itunes: itunesItemSchema.optional(),
  media: mediaNamespaceSchema.optional(),
});

export type AtomEntry = z.infer<typeof atomEntrySchema>;

export const jsonFeedItemSchema = z.object({
  id: optionalText,
  url: optionalText,
  external_url: optionalText,
  title: optionalText,
  summary: optionalText,
  content_text: optionalText,
  content_html: optionalText,
  image: optionalText,
  banner_image: optionalText,
  date_published: optionalText,
  date_modified: optionalText,
  authors: z.array(z.object({ name: optionalText })).optional(),
  attachments: z.array(z.object({ url: optionalText, mime_type: optionalText })).optional(),
});

export type JsonFeedItem = z.infer<typeof jsonFeedItemSchema>;

/** The envelope only needs the format tag and the untouched entry list; each entry gets its own
 * safeParse afterwards. RDF feeds carry `items` exactly like RSS, so they share that branch. */
export const parsedFeedEnvelopeSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("rss"),
    feed: z.object({ items: z.array(z.unknown()).optional() }),
  }),
  z.object({
    format: z.literal("rdf"),
    feed: z.object({ items: z.array(z.unknown()).optional() }),
  }),
  z.object({
    format: z.literal("atom"),
    feed: z.object({ entries: z.array(z.unknown()).optional() }),
  }),
  z.object({
    format: z.literal("json"),
    feed: z.object({ items: z.array(z.unknown()).optional() }),
  }),
]);

export type ParsedFeedEnvelope = z.infer<typeof parsedFeedEnvelopeSchema>;
