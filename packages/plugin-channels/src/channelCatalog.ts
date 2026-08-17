/**
 * Purpose: the channel catalog format — a static JSON file that ships with the app and can be
 * updated on its own, listing which sources exist, how to reach them, and how hard we are allowed
 * to poll them. Users add their own feeds by appending entries of the same shape.
 * Main exports: channelSourceSchema, channelCatalogSchema, parseChannelCatalog,
 * loadStarterChannelCatalog, ChannelSource, ChannelCatalog.
 */
import { z } from "zod";
import { candidateItemKindSchema } from "./candidateItem";
import starterCatalogJson from "./starterChannelCatalog.json" with { type: "json" };

/** Adapter families. Only the generic feed adapter exists today; the specialized ones
 * (Discourse, V2EX, Hacker News, arXiv, iTunes, YouTube, Douban) join this union when they land. */
export const channelAdapterTypes = ["generic-feed"] as const;

export const channelAdapterTypeSchema = z.enum(channelAdapterTypes);

export type ChannelAdapterType = z.infer<typeof channelAdapterTypeSchema>;

/** Endpoint config for the generic RSS/Atom/JSON-Feed adapter: just the feed address. */
export const genericFeedEndpointSchema = z.object({
  feedUrl: z.url(),
});

export const fetchPolicySchema = z.object({
  /** Shortest gap between two requests to this source, in milliseconds. */
  minimumIntervalMilliseconds: z.number().int().positive(),
  /** How many requests this source may spend per calendar day (local time). */
  dailyRequestBudget: z.number().int().positive(),
  /** Sites that 403 a library User-Agent (linux.do, for one) get their own string here. */
  userAgentOverride: z.string().min(1).nullable(),
});

export type FetchPolicy = z.infer<typeof fetchPolicySchema>;

export const channelSourceSchema = z.object({
  id: z.string().min(1),
  /** Shown to the reader as the source name, in the source's own language. */
  displayName: z.string().min(1),
  adapterType: channelAdapterTypeSchema,
  endpoint: genericFeedEndpointSchema,
  /** BCP 47 tag, e.g. "zh-CN" or "en". */
  language: z.string().min(2),
  /** What the items are when the payload itself does not say (a plain blog feed is articles;
   * an audio enclosure still overrides this to "podcast"). */
  defaultKind: candidateItemKindSchema,
  /** Whether a fresh install polls this source before the reader touches settings. */
  defaultEnabled: z.boolean(),
  fetchPolicy: fetchPolicySchema,
});

export type ChannelSource = z.infer<typeof channelSourceSchema>;

export const channelCatalogSchema = z.object({
  /** Bumped when the format changes, so an older app can refuse a newer catalog. */
  formatVersion: z.literal(1),
  /** Date the catalog contents were last verified, ISO 8601 date. */
  revisedOn: z.iso.date(),
  sources: z.array(channelSourceSchema).min(1),
});

export type ChannelCatalog = z.infer<typeof channelCatalogSchema>;

/** Rejects duplicate source ids, which would silently merge two channels' fetch state. */
function assertSourceIdsAreUnique(catalog: ChannelCatalog): void {
  const seen = new Set<string>();
  for (const source of catalog.sources) {
    if (seen.has(source.id)) throw new Error(`duplicate channel source id: ${source.id}`);
    seen.add(source.id);
  }
}

/** Parses catalog JSON from disk, an update download, or a user-pasted entry. */
export function parseChannelCatalog(value: unknown): ChannelCatalog {
  const catalog = channelCatalogSchema.parse(value);
  assertSourceIdsAreUnique(catalog);
  return catalog;
}

/** The catalog bundled with the app. Validated on every call so a bad edit fails loudly here
 * rather than halfway through a poll. */
export function loadStarterChannelCatalog(): ChannelCatalog {
  return parseChannelCatalog(starterCatalogJson);
}
