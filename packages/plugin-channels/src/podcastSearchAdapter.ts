/**
 * Purpose: podcast discovery through the iTunes Search API — the survey's one key-free, sign-up-free
 * way to turn a term into podcast feed addresses (about 20 calls a minute). It is search-only: once
 * a show is found, its episodes arrive through the ordinary RSS path, where an audio enclosure
 * already classifies items as podcasts. Episode search is also useful on its own, because
 * `entity=podcastEpisode` answers with the audio address and the whole show notes in one call.
 * Main exports: searchPodcastShows, searchPodcastEpisodes, buildItunesSearchUrl.
 */
import { z } from "zod";
import { type CandidateItem, parseCandidateItems } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import { firstNonEmptyText, stripHtmlToPlainText, toIsoInstant } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { maximumSummaryLength } from "./genericFeedItemMapping";
import { parseJsonPayload } from "./jsonPayload";

const optionalText = z.string().nullish();

export const itunesResultSchema = z.object({
  wrapperType: optionalText,
  trackId: z.number().nullish(),
  trackName: optionalText,
  collectionName: optionalText,
  artistName: optionalText,
  /** The show's own RSS address — the whole point of the show search. */
  feedUrl: optionalText,
  trackViewUrl: optionalText,
  /** Episodes only: the audio file itself. */
  episodeUrl: optionalText,
  episodeGuid: optionalText,
  description: optionalText,
  shortDescription: optionalText,
  artworkUrl600: optionalText,
  artworkUrl100: optionalText,
  releaseDate: optionalText,
});

export type ItunesResult = z.infer<typeof itunesResultSchema>;

export const itunesResponseSchema = z.object({ results: z.array(z.unknown()) });

export interface PodcastSearchOptions {
  /** iTunes caps this itself; 20 keeps one call cheap. */
  limit?: number;
  /** Two-letter store code. Left out by default, so Apple geolocates the reader. */
  country?: string;
  observedAt?: Date;
}

export function buildItunesSearchUrl(
  source: ChannelSource,
  query: string,
  entity: "podcast" | "podcastEpisode",
  options: PodcastSearchOptions = {},
): string {
  const url = new URL(source.endpoint.feedUrl);
  url.searchParams.set("media", "podcast");
  url.searchParams.set("entity", entity);
  url.searchParams.set("term", query);
  url.searchParams.set("limit", String(options.limit ?? 20));
  if (options.country) url.searchParams.set("country", options.country);
  return url.toString();
}

async function requestItunesResults(
  url: string,
  context: FetchContext,
): Promise<readonly unknown[]> {
  const outcome = await context.fetchUrl(url, { kind: "follow-up", accept: jsonAcceptHeader });
  if (outcome.status !== "fetched") return [];
  const payload = parseJsonPayload(outcome.body);
  if (!payload.ok) return [];
  const response = itunesResponseSchema.safeParse(payload.value);
  return response.success ? response.data.results : [];
}

export interface PodcastShow {
  showName: string;
  /** Add this to the catalog as a generic-feed source and the episodes flow in. */
  feedUrl: string;
  artworkUrl: string | null;
  /** The show's page in Apple Podcasts, for the reader who wants to look before subscribing. */
  storeUrl: string | null;
}

/** Shows without a feed address are dropped: an entry we cannot subscribe to is not a result. */
export async function searchPodcastShows(
  query: string,
  source: ChannelSource,
  context: FetchContext,
  options: PodcastSearchOptions = {},
): Promise<PodcastShow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results = await requestItunesResults(
    buildItunesSearchUrl(source, trimmed, "podcast", options),
    context,
  );
  const shows: PodcastShow[] = [];
  for (const entry of results) {
    const parsed = itunesResultSchema.safeParse(entry);
    if (!parsed.success) continue;
    const feedUrl = firstNonEmptyText(parsed.data.feedUrl);
    const showName = firstNonEmptyText(parsed.data.collectionName, parsed.data.trackName);
    if (!feedUrl || !showName) continue;
    shows.push({
      showName,
      feedUrl,
      artworkUrl: firstNonEmptyText(parsed.data.artworkUrl600, parsed.data.artworkUrl100),
      storeUrl: firstNonEmptyText(parsed.data.trackViewUrl),
    });
  }
  return shows;
}

/**
 * The episode's own address is the audio file: an episode found this way has no feed behind it
 * yet, and the audio link is the only one the overlay player can use without a second request.
 * The Apple Podcasts page stands in when the audio address is missing.
 */
function toEpisodeDraft(result: ItunesResult, sourceId: string, observedAtIso: string): unknown {
  const identity = firstNonEmptyText(
    result.episodeGuid,
    result.trackId === null || result.trackId === undefined ? null : String(result.trackId),
    result.episodeUrl,
  );
  const summary = stripHtmlToPlainText(
    firstNonEmptyText(result.description, result.shortDescription) ?? "",
  );
  return {
    id: `${sourceId}:${identity}`,
    sourceId,
    kind: "podcast",
    url: firstNonEmptyText(result.episodeUrl, result.trackViewUrl),
    title: stripHtmlToPlainText(result.trackName),
    summary: summary.slice(0, maximumSummaryLength).trimEnd(),
    coverUrl: firstNonEmptyText(result.artworkUrl600, result.artworkUrl100),
    author: firstNonEmptyText(result.collectionName, result.artistName),
    publishedAt: toIsoInstant(result.releaseDate) ?? observedAtIso,
    upstreamSignal: null,
  };
}

/** iTunes publishes no popularity number for an episode, so these arrive with no crowd signal. */
export async function searchPodcastEpisodes(
  query: string,
  source: ChannelSource,
  context: FetchContext,
  options: PodcastSearchOptions = {},
): Promise<CandidateItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const results = await requestItunesResults(
    buildItunesSearchUrl(source, trimmed, "podcastEpisode", options),
    context,
  );
  const observedAtIso = (options.observedAt ?? new Date()).toISOString();
  const drafts: unknown[] = [];
  for (const entry of results) {
    const parsed = itunesResultSchema.safeParse(entry);
    if (parsed.success) drafts.push(toEpisodeDraft(parsed.data, source.id, observedAtIso));
  }
  return parseCandidateItems(drafts).items;
}
