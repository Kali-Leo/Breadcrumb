/**
 * Purpose: the polling half of Apple's podcast pipeline — chart, lookup, then the shows' own feeds,
 * which is where the episodes are. One poll opens only a few shows and moves the window on each
 * time, so a fifty-show chart is read through over a couple of weeks instead of in one expensive
 * round. Cover art is never missing: the episode's feed usually carries it, and the chart's own
 * artwork stands in when it does not.
 * Main exports: podcastChartShowWindow, fetchPodcastChartSource, defaultEpisodesPerShow.
 */
import type { CandidateItem } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { parseFeedIntoCandidateItems } from "./genericFeedAdapter";
import {
  itunesRateWindow,
  lookupPodcastFeedUrls,
  type PodcastChartEntry,
  parsePodcastChartEntries,
} from "./podcastChartDirectory";
import type { RequestRateWindow } from "./requestRateWindow";
import { outcomeOnlyResult, type SourceFetchResult } from "./sourceFetchResult";

/** Enough for a card each without letting one show fill a batch. */
export const defaultEpisodesPerShow = 5;

/** When the catalog entry says nothing, three shows a poll: two iTunes calls plus three feeds. */
export const defaultShowFeedsPerPoll = 3;

/**
 * Which slice of the chart this poll reads. The window advances by one poll interval, so
 * consecutive polls show different shows and the whole chart comes round in time; it is derived
 * from the clock rather than stored, because a poll must produce the same answer whether or not
 * the app was running yesterday.
 */
export function podcastChartShowWindow(
  entries: readonly PodcastChartEntry[],
  windowSize: number,
  pollIntervalMilliseconds: number,
  observedAt: Date,
): PodcastChartEntry[] {
  if (entries.length === 0 || windowSize <= 0) return [];
  const size = Math.min(windowSize, entries.length);
  const pollNumber =
    pollIntervalMilliseconds > 0 ? Math.floor(observedAt.getTime() / pollIntervalMilliseconds) : 0;
  const start = (((pollNumber * size) % entries.length) + entries.length) % entries.length;
  const window: PodcastChartEntry[] = [];
  for (let offset = 0; offset < size; offset += 1) {
    const entry = entries[(start + offset) % entries.length];
    if (entry !== undefined) window.push(entry);
  }
  return window;
}

/** Newest first, so a show that publishes daily does not push a weekly one out of the batch. */
function newestEpisodes(items: readonly CandidateItem[], count: number): CandidateItem[] {
  return [...items]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, count);
}

interface ShowHarvest {
  items: CandidateItem[];
  skippedEntryCount: number;
}

async function readShowFeed(
  source: ChannelSource,
  show: PodcastChartEntry,
  feedUrl: string,
  context: FetchContext,
  observedAt: Date | undefined,
): Promise<ShowHarvest> {
  const outcome = await context.fetchUrl(feedUrl, { kind: "follow-up" });
  if (outcome.status !== "fetched") return { items: [], skippedEntryCount: 0 };
  const parsed = parseFeedIntoCandidateItems({
    sourceId: source.id,
    defaultKind: "podcast",
    feedText: outcome.body,
    baseUrl: outcome.finalUrl,
    observedAt,
  });
  const items = newestEpisodes(parsed.items, defaultEpisodesPerShow).map((item) => ({
    ...item,
    // The chart's artwork is the show's, not the episode's, so it is a fallback and never a
    // replacement for a cover the episode published itself.
    coverUrl: item.coverUrl ?? show.artworkUrl,
    author: item.author ?? show.showName,
  }));
  return { items, skippedEntryCount: parsed.skippedEntryCount };
}

export interface PodcastChartRequestOptions {
  /** Swapped in tests, so one test's calls do not use up another's room. */
  rateWindow?: RequestRateWindow;
  observedAt?: Date;
}

/**
 * Reads one category chart. The chart request is the poll — it owns the conditional-request state
 * and answers the "is this source alive" question — and the lookup and the show feeds are
 * follow-ups, so they spend daily budget without waiting out the poll interval. Every step
 * degrades quietly: a chart that will not parse, a lookup that answers nothing, a show feed that
 * is down and a shared iTunes window with no room left all end as fewer cards, never as an error
 * and never as a wait.
 */
export async function fetchPodcastChartSource(
  source: ChannelSource,
  context: FetchContext,
  options: PodcastChartRequestOptions = {},
): Promise<SourceFetchResult> {
  const rateWindow = options.rateWindow ?? itunesRateWindow;
  const observedAt = options.observedAt;
  if (!rateWindow.tryAcquire()) {
    return outcomeOnlyResult(source.id, { status: "skipped", reason: "service-rate-limit" });
  }
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, {
    kind: "poll",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);

  const entries = parsePodcastChartEntries(outcome.body);
  if (entries.length === 0) {
    return {
      sourceId: source.id,
      outcome,
      items: [],
      skippedEntryCount: 0,
      parseError: "iTunes chart carried no shows",
      repairedFromTruncation: false,
      followUpRequestCount: 0,
    };
  }

  const window = podcastChartShowWindow(
    entries,
    source.endpoint.showFeedsPerPoll ?? defaultShowFeedsPerPoll,
    source.fetchPolicy.minimumIntervalMilliseconds,
    observedAt ?? new Date(),
  );
  // The lookup is the poll's second iTunes call, so it asks the shared window for its own room.
  const lookupAllowed = rateWindow.tryAcquire();
  const feedUrls = lookupAllowed
    ? await lookupPodcastFeedUrls(
        window.map((show) => show.collectionId),
        context,
      )
    : new Map<string, string>();

  const items: CandidateItem[] = [];
  let skippedEntryCount = 0;
  /** The lookup call, plus one per show feed actually opened. */
  let followUpRequestCount = lookupAllowed ? 1 : 0;
  // One show at a time: these are follow-ups on one source's budget, and the shows' hosts have no
  // reason to see three simultaneous reads from one reader.
  for (const show of window) {
    const feedUrl = feedUrls.get(show.collectionId);
    if (feedUrl === undefined) continue;
    followUpRequestCount += 1;
    const harvest = await readShowFeed(source, show, feedUrl, context, observedAt);
    items.push(...harvest.items);
    skippedEntryCount += harvest.skippedEntryCount;
  }

  return {
    sourceId: source.id,
    outcome,
    items,
    skippedEntryCount,
    parseError: null,
    repairedFromTruncation: false,
    followUpRequestCount,
  };
}
