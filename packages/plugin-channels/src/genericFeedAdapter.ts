/**
 * Purpose: the generic adapter behind most of the catalog — RSS, RDF, Atom and JSON Feed in,
 * candidate items out. It never throws: an unparseable payload comes back as a parse error and an
 * empty list, and individual bad entries are counted and dropped so the rest of the feed survives.
 * Main exports: parseFeedIntoCandidateItems, parseSourceFeed, FeedAdapterResult.
 */
import { parseFeed } from "feedsmith";
import type { z } from "zod";
import { type CandidateItem, type CandidateItemKind, candidateItemSchema } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import {
  atomEntrySchema,
  jsonFeedItemSchema,
  parsedFeedEnvelopeSchema,
  rssItemSchema,
} from "./feedSchemas";
import { repairTruncatedFeed } from "./feedText";
import {
  type FeedItemMappingContext,
  mapAtomEntry,
  mapJsonFeedItem,
  mapRssItem,
} from "./genericFeedItemMapping";

export interface GenericFeedAdapterInput {
  sourceId: string;
  defaultKind: CandidateItemKind;
  /** Raw feed payload, already size-capped by the fetcher. */
  feedText: string;
  /** Post-redirect feed address; relative links and covers resolve against it. */
  baseUrl: string;
  observedAt?: Date;
}

export interface FeedAdapterResult {
  items: CandidateItem[];
  /** Entries dropped for failing validation, having no usable link, or repeating an id. */
  skippedEntryCount: number;
  /** Set when the payload could not be read as a feed at all. */
  parseError: string | null;
  /** True when the payload was cut mid-document and we salvaged the complete entries. */
  repairedFromTruncation: boolean;
}

/** Returns a candidate draft, or null when the entry did not match its format's schema. */
type EntryMapper = (entry: unknown, context: FeedItemMappingContext) => unknown;

/** Each entry is validated on its own, then mapped; failures return null and are counted. */
function makeMapper<Parsed>(
  schema: z.ZodType<Parsed>,
  map: (parsed: Parsed, context: FeedItemMappingContext) => unknown,
): EntryMapper {
  return (entry, context) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? map(parsed.data, context) : null;
  };
}

const rssMapper = makeMapper(rssItemSchema, mapRssItem);
const atomMapper = makeMapper(atomEntrySchema, mapAtomEntry);
const jsonMapper = makeMapper(jsonFeedItemSchema, mapJsonFeedItem);

function selectEntries(envelope: unknown): { entries: unknown[]; mapper: EntryMapper } | null {
  const parsed = parsedFeedEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return null;
  if (parsed.data.format === "atom") {
    return { entries: parsed.data.feed.entries ?? [], mapper: atomMapper };
  }
  if (parsed.data.format === "json") {
    return { entries: parsed.data.feed.items ?? [], mapper: jsonMapper };
  }
  return { entries: parsed.data.feed.items ?? [], mapper: rssMapper };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Second chance for payloads the size cap cut in half: reparse the salvaged prefix. */
function parsePayload(feedText: string): { envelope: unknown; repaired: boolean } | string {
  try {
    return { envelope: parseFeed(feedText), repaired: false };
  } catch (error) {
    const salvaged = repairTruncatedFeed(feedText);
    if (salvaged === null) return describeError(error);
    try {
      return { envelope: parseFeed(salvaged), repaired: true };
    } catch (secondError) {
      return describeError(secondError);
    }
  }
}

export function parseFeedIntoCandidateItems(input: GenericFeedAdapterInput): FeedAdapterResult {
  const parsed = parsePayload(input.feedText);
  if (typeof parsed === "string") {
    return { items: [], skippedEntryCount: 0, parseError: parsed, repairedFromTruncation: false };
  }

  const selected = selectEntries(parsed.envelope);
  if (!selected) {
    return {
      items: [],
      skippedEntryCount: 0,
      parseError: "unrecognized feed structure",
      repairedFromTruncation: parsed.repaired,
    };
  }

  const context: FeedItemMappingContext = {
    sourceId: input.sourceId,
    defaultKind: input.defaultKind,
    baseUrl: input.baseUrl,
    observedAtIso: (input.observedAt ?? new Date()).toISOString(),
  };

  const items: CandidateItem[] = [];
  const seenIds = new Set<string>();
  let skippedEntryCount = 0;
  for (const entry of selected.entries) {
    const draft = selected.mapper(entry, context);
    const candidate = candidateItemSchema.safeParse(draft);
    if (!candidate.success || seenIds.has(candidate.data.id)) {
      skippedEntryCount += 1;
      continue;
    }
    seenIds.add(candidate.data.id);
    items.push(candidate.data);
  }
  return { items, skippedEntryCount, parseError: null, repairedFromTruncation: parsed.repaired };
}

/** Convenience wrapper for a catalog source and a successful fetch outcome. */
export function parseSourceFeed(
  source: ChannelSource,
  fetched: { body: string; finalUrl: string },
  observedAt?: Date,
): FeedAdapterResult {
  return parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: source.defaultKind,
    feedText: fetched.body,
    baseUrl: fetched.finalUrl,
    observedAt,
  });
}
