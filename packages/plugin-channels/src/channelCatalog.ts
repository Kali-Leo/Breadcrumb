/**
 * Purpose: the channel catalog format — a static JSON file that ships with the app and can be
 * updated on its own, listing which sources exist, how to reach them, and how hard we are allowed
 * to poll them. Users add their own feeds by appending entries of the same shape, and template
 * entries (豆瓣 user activity) wait for the parameter the reader supplies in settings.
 * Main exports: channelSourceSchema, channelCatalogSchema, parseChannelCatalog,
 * loadStarterChannelCatalog, fillSourceTemplate, ChannelSource, ChannelCatalog.
 */
import { z } from "zod";
import { candidateItemKindSchema } from "./candidateItem";
import starterCatalogJson from "./starterChannelCatalog.json" with { type: "json" };

/** Adapter families. Each one knows how to turn a specific service's payload into candidate
 * items; every other source in the world goes through "generic-feed". */
export const channelAdapterTypes = [
  "generic-feed",
  "discourse",
  "v2ex",
  "hackernews",
  "arxiv",
  "podcast-search",
  "podcast-charts",
  "youtube-channel",
  "bilibili-ranking",
  "wikipedia-featured",
  "douban-user",
] as const;

export const channelAdapterTypeSchema = z.enum(channelAdapterTypes);

export type ChannelAdapterType = z.infer<typeof channelAdapterTypeSchema>;

/**
 * Every source states one address, `feedUrl`: the thing a poll reads, or — for the search-only
 * families — the API entry point a query is appended to. Adapters that need a second number carry
 * it alongside; nothing else is stored, because anything more is guesswork the survey did not
 * verify.
 */
export const channelEndpointSchema = z.object({
  feedUrl: z.url(),
  /**
   * Discourse only: how many of the newest topics a poll may open through `/t/{id}.json` for the
   * full post body and the reply count. Zero keeps the poll to the one RSS request.
   */
  fullTextTopicsPerPoll: z.number().int().min(0).max(20).optional(),
  /**
   * Podcast category charts only: how many shows from the chart a poll may open for their
   * episodes. The window moves on each poll, so a small number still reads the whole chart over
   * time, and a large one costs the reader a slow round for no more variety.
   */
  showFeedsPerPoll: z.number().int().min(0).max(10).optional(),
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

/** A blank the reader fills in before the source works, substituted into `feedUrl` as `{name}`. */
export const templateParameterSchema = z.object({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
  /** Shown next to the input in settings, in the source's own language. */
  label: z.string().min(1),
});

export type TemplateParameter = z.infer<typeof templateParameterSchema>;

export const channelSourceSchema = z.object({
  id: z.string().min(1),
  /** Shown to the reader as the source name, in the source's own language. */
  displayName: z.string().min(1),
  adapterType: channelAdapterTypeSchema,
  endpoint: channelEndpointSchema,
  /**
   * BCP 47 tag, e.g. "zh-CN" or "en" — the language of what this source publishes, which the feed
   * is filtered by (spec 054, Leo's second point: after choosing a language the reader should not
   * be shown the others). A source that mixes languages declares the dominant one. "und" is
   * reserved for the search-only entries, whose language is whatever the reader typed, and means
   * "no language of its own" rather than "unknown".
   */
  language: z.string().min(2),
  /** What the items are when the payload itself does not say (a plain blog feed is articles;
   * an audio enclosure still overrides this to "podcast"). */
  defaultKind: candidateItemKindSchema,
  /** Whether a fresh install polls this source before the reader touches settings. */
  defaultEnabled: z.boolean(),
  fetchPolicy: fetchPolicySchema,
  /** Present and non-empty means the entry is a template: unusable until `fillSourceTemplate`
   * substitutes the reader's values. Absent is the ordinary case. */
  templateParameters: z.array(templateParameterSchema).optional(),
  /** True when the address was not measured in a channel survey (2026-08-17 or 2026-08-18). */
  unverified: z.boolean().optional(),
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

/** A template entry is not fetchable as it stands — its address still has `{name}` blanks in it. */
export function isSourceTemplate(source: ChannelSource): boolean {
  return (source.templateParameters?.length ?? 0) > 0;
}

/**
 * Substitutes the values the reader typed into a template entry and returns a plain source.
 * Values are URL-encoded, so a pasted id with a slash or a space cannot rewrite the path.
 * Throws when a parameter is missing or blank: an unfinished template must never reach the network.
 */
export function fillSourceTemplate(
  source: ChannelSource,
  values: Readonly<Record<string, string>>,
): ChannelSource {
  let feedUrl = source.endpoint.feedUrl;
  for (const parameter of source.templateParameters ?? []) {
    const value = values[parameter.name]?.trim();
    if (!value) throw new Error(`missing template parameter ${parameter.name} for ${source.id}`);
    feedUrl = feedUrl.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
  }
  return channelSourceSchema.parse({
    ...source,
    endpoint: { ...source.endpoint, feedUrl },
    templateParameters: undefined,
  });
}
