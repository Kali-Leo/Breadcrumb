/**
 * Purpose: the desktop app's side of the channel layer (spec 053 §1-2) — builds the fetcher on
 * Tauri's HTTP client, decides which catalog sources are worth a request right now, polls them
 * for new items and sends active-recall queries to the ones that answer queries. Nothing here
 * reports an error upward: a channel that is switched off, out of budget, in backoff or simply
 * unreachable contributes no items and no complaint (spec 053 总则).
 * Side effects: network requests, channel_state reads and writes.
 * Main exports: pollChannelsForCandidates, searchChannelsForCandidates, ChannelPollOutcome.
 */
import {
  type CandidateItem,
  ChannelFetcher,
  type ChannelSource,
  type FetchImplementation,
  fetchLatestFromSource,
  loadStarterChannelCatalog,
  searchTopics,
  sourceSupportsSearch,
} from "@breadcrumb/plugin-channels";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  createChannelStateConditionalStore,
  isSourceAvailableNow,
  readChannelStates,
  recordSourceFetch,
} from "./discoveryChannelState";

export interface ChannelPollOutcome {
  items: CandidateItem[];
  /** How many sources actually spent a request. Zero means every channel was skipped — which
   * on a machine with no network is the normal, silent case. */
  attemptedSourceCount: number;
  /** How many of those answered at all (a 304 counts: the source is alive, it just has nothing
   * new). Zero attempts and zero answers are what "nothing is reachable from here" looks like. */
  answeredSourceCount: number;
}

export interface ChannelAccessOptions {
  /** Swapped in tests; production always uses Tauri's HTTP client, which is not subject to the
   * webview's CORS rules. */
  fetchImplementation?: FetchImplementation;
  /** Overrides the shipped catalog — the settings page's user-added feeds will pass this. */
  sources?: readonly ChannelSource[];
  /** Spec 053 §2's 省流量模式. The switch itself lands with the settings page (T8). */
  dataSaverEnabled?: boolean;
  now?: () => Date;
}

function catalogSources(options: ChannelAccessOptions): ChannelSource[] {
  if (options.sources !== undefined) return [...options.sources];
  // Per-source switches live in settings and land with the settings page (spec 053 T8); until
  // then the catalog's own default decides, which is "on" for everything but the 豆瓣 template.
  return loadStarterChannelCatalog().sources.filter((source) => source.defaultEnabled);
}

function buildFetcher(options: ChannelAccessOptions): ChannelFetcher {
  return new ChannelFetcher({
    fetchImplementation: options.fetchImplementation ?? tauriFetch,
    conditionalRequestStore: createChannelStateConditionalStore(),
    dataSaverEnabled: options.dataSaverEnabled ?? false,
  });
}

/**
 * One polling round over every enabled source that is due a request. Sources run at the same
 * time; each one's rate limit, daily budget and backoff are enforced inside the context it
 * fetches through, and arXiv's three-second spacing is enforced by the adapter's shared pacer.
 */
export async function pollChannelsForCandidates(
  options: ChannelAccessOptions = {},
): Promise<ChannelPollOutcome> {
  const now = options.now ?? (() => new Date());
  const states = await readChannelStates();
  const due = catalogSources(options).filter((source) =>
    isSourceAvailableNow(source, states.get(source.id), now()),
  );
  if (due.length === 0) {
    return { items: [], attemptedSourceCount: 0, answeredSourceCount: 0 };
  }

  const fetcher = buildFetcher(options);
  const results = await Promise.all(
    due.map(async (source) => {
      try {
        return await fetchLatestFromSource(source, fetcher.contextForSource(source), now());
      } catch {
        // fetchLatestFromSource is documented never to throw; if a future adapter does, one
        // broken channel still must not cost the reader the whole round.
        return null;
      }
    }),
  );

  const items: CandidateItem[] = [];
  let attemptedSourceCount = 0;
  let answeredSourceCount = 0;
  for (const result of results) {
    if (result === null) continue;
    await recordSourceFetch(result, now());
    if (result.outcome.status !== "skipped") attemptedSourceCount += 1;
    if (result.outcome.status === "fetched" || result.outcome.status === "not-modified") {
      answeredSourceCount += 1;
    }
    items.push(...result.items);
  }
  return { items, attemptedSourceCount, answeredSourceCount };
}

/** What one recall term brought back. The term travels with its items because it — not the
 * channel that answered — is the interest the reader showed, and it becomes the card's topic. */
export interface TopicSearchHarvest {
  query: string;
  items: CandidateItem[];
}

/**
 * Sends the given query terms to the channels that answer queries (Hacker News, arXiv, iTunes),
 * one term at a time so each term's spend is countable against the daily query budget the
 * caller holds. Repeated ids are dropped across terms, so the first term to find an item keeps
 * it.
 */
export async function searchChannelsForCandidates(
  queries: readonly string[],
  options: ChannelAccessOptions = {},
): Promise<TopicSearchHarvest[]> {
  const now = options.now ?? (() => new Date());
  const searchable = catalogSources(options).filter(sourceSupportsSearch);
  const firstSource = searchable[0];
  if (queries.length === 0 || firstSource === undefined) return [];

  const fetcher = buildFetcher(options);
  const seenIds = new Set<string>();
  const harvests: TopicSearchHarvest[] = [];
  for (const query of queries) {
    const found = await searchTopics(query, searchable, fetcher.contextForSource(firstSource), {
      contextForSource: (source) => fetcher.contextForSource(source),
      observedAt: now(),
    });
    const items: CandidateItem[] = [];
    for (const item of found) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push(item);
    }
    harvests.push({ query, items });
  }
  return harvests;
}
