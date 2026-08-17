/**
 * Purpose: the active-recall half of the channel layer (spec 053 requirement 4) — one interest
 * term goes out to every channel that accepts a query, and whatever comes back becomes candidates.
 * Failures are not reported: a search that times out simply contributes nothing, because a thinner
 * batch is a far better outcome for the reader than an error where content should be.
 * Main exports: searchTopics, TopicSearchOptions.
 */

import { selectSearchableSources } from "./adapterCapabilities";
import { searchArxiv } from "./arxivAdapter";
import type { CandidateItem } from "./candidateItem";
import type { ChannelAdapterType, ChannelSource } from "./channelCatalog";
import type { FetchContext } from "./fetchContract";
import { searchHackerNews } from "./hackerNewsAdapter";
import { searchPodcastEpisodes } from "./podcastSearchAdapter";
import type { RequestPacer } from "./requestPacer";

export interface TopicSearchOptions {
  /**
   * Gives each source the context bound to its own budget and User-Agent —
   * `ChannelFetcher.contextForSource` has exactly this shape. Without it every source shares the
   * context passed in, which is right for a one-off query and wrong for a daily recall run.
   */
  contextForSource?: (source: ChannelSource) => FetchContext;
  maximumResultsPerSource?: number;
  /** Two-letter store code for the podcast search; left out, Apple geolocates the reader. */
  podcastCountry?: string;
  /** Swapped in tests so arXiv's three-second rule does not make the suite wait. */
  arxivPacer?: RequestPacer;
  observedAt?: Date;
}

async function searchOneSource(
  query: string,
  source: ChannelSource,
  context: FetchContext,
  options: TopicSearchOptions,
): Promise<CandidateItem[]> {
  const limit = options.maximumResultsPerSource ?? 20;
  switch (source.adapterType) {
    case "hackernews":
      return searchHackerNews(query, source, context, {
        hitsPerPage: limit,
        observedAt: options.observedAt,
      });
    case "arxiv":
      return searchArxiv(query, source, context, {
        maximumResults: limit,
        pacer: options.arxivPacer,
        observedAt: options.observedAt,
      });
    case "podcast-search":
      return searchPodcastEpisodes(query, source, context, {
        limit,
        country: options.podcastCountry,
        observedAt: options.observedAt,
      });
    default:
      return [];
  }
}

/** One query per channel family: three arXiv category feeds in the catalog are still one arXiv. */
function oneSourcePerAdapterFamily(sources: readonly ChannelSource[]): ChannelSource[] {
  const chosen = new Map<ChannelAdapterType, ChannelSource>();
  for (const source of sources) {
    if (!chosen.has(source.adapterType)) chosen.set(source.adapterType, source);
  }
  return [...chosen.values()];
}

/**
 * Fans the term out to the searchable sources among the ones given and returns everything that
 * came back, in source order, with repeated ids dropped. Sources are queried at the same time:
 * each one's own rate limit, daily budget and — for arXiv — hard three-second spacing still apply,
 * because they are enforced inside the context each source fetches through.
 */
export async function searchTopics(
  query: string,
  sources: readonly ChannelSource[],
  context: FetchContext,
  options: TopicSearchOptions = {},
): Promise<CandidateItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const searchable = oneSourcePerAdapterFamily(selectSearchableSources(sources));
  const batches = await Promise.all(
    searchable.map(async (source) => {
      const sourceContext = options.contextForSource?.(source) ?? context;
      try {
        return await searchOneSource(trimmed, source, sourceContext, options);
      } catch {
        return [];
      }
    }),
  );

  const seenIds = new Set<string>();
  const items: CandidateItem[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push(item);
    }
  }
  return items;
}
