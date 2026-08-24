/**
 * Purpose: which of the two jobs each adapter family can do — answer a scheduled poll, and answer
 * a search term. The pipeline reads this instead of hard-coding lists of adapter names: the
 * passive layer polls what can be polled, and the active-recall layer (spec 053 requirement 4)
 * sends its query only to the families that accept one.
 * Main exports: adapterCapabilities, sourceSupportsPolling, sourceSupportsSearch,
 * selectSearchableSources.
 */
import type { ChannelAdapterType, ChannelSource } from "./channelCatalog";
import { isSourceTemplate } from "./channelCatalog";

export interface AdapterCapabilities {
  /** The source has a feed address a scheduled poll can read. */
  readonly poll: boolean;
  /** The source answers a free-text query, so active recall may spend a daily query on it. */
  readonly search: boolean;
}

export const adapterCapabilities: Readonly<Record<ChannelAdapterType, AdapterCapabilities>> = {
  "generic-feed": { poll: true, search: false },
  discourse: { poll: true, search: false },
  v2ex: { poll: true, search: false },
  /** Algolia serves the front page and arbitrary queries through the same API. */
  hackernews: { poll: true, search: true },
  /** Category RSS for the poll, the query API for recall. */
  arxiv: { poll: true, search: true },
  /** iTunes Search has no feed of its own; it only resolves terms to shows and episodes. */
  "podcast-search": { poll: false, search: true },
  /** A category chart is a list that changes daily, so it polls; it takes no query of its own. */
  "podcast-charts": { poll: true, search: false },
  "wikipedia-featured": { poll: true, search: false },
  "douban-user": { poll: true, search: false },
};

/** A template whose parameters are still blank cannot be polled, whatever its family can do. */
export function sourceSupportsPolling(source: ChannelSource): boolean {
  return adapterCapabilities[source.adapterType].poll && !isSourceTemplate(source);
}

export function sourceSupportsSearch(source: ChannelSource): boolean {
  return adapterCapabilities[source.adapterType].search && !isSourceTemplate(source);
}

/** The searchable subset of whatever list the caller has, in the order it was given. */
export function selectSearchableSources(
  sources: readonly ChannelSource[],
): readonly ChannelSource[] {
  return sources.filter(sourceSupportsSearch);
}
