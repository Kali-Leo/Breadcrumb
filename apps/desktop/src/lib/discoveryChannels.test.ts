/**
 * Purpose: unit tests for the polling round — a real RSS payload becomes candidate items through
 * the real fetcher and adapter (only the socket is faked), a source in backoff is not asked at
 * all, a dead source costs the round nothing but itself, and every poll's outcome is written to
 * channel_state so the next launch starts where this one left off — and for the recall round,
 * whose sources used to leave no trace in channel_state at all.
 */
import type { ChannelStateRow } from "@breadcrumb/core-db";
import type { ChannelSource } from "@breadcrumb/plugin-channels";
import { afterEach, describe, expect, it, vi } from "vitest";

let stateRows: ChannelStateRow[] = [];
/** The reader's source settings, as the settings table would hand them back. */
let storedChannelSettings: unknown = {};

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    settings: {
      get: async () => storedChannelSettings,
      set: async () => {},
    },
    channelState: {
      get: async (sourceId: string) => stateRows.find((row) => row.source_id === sourceId) ?? null,
      listAll: async () => stateRows,
      upsert: async (row: ChannelStateRow) => {
        stateRows = [...stateRows.filter((existing) => existing.source_id !== row.source_id), row];
      },
    },
  })),
}));

const { pollChannelsForCandidates, searchChannelsForCandidates } = await import(
  "./discoveryChannels"
);
const { useDiscoveryChannelSettingsStore } = await import(
  "../stores/discoveryChannelSettingsStore"
);
const { listCatalogChannelChoices } = await import("./discoveryChannelSources");

const NOW = new Date("2026-08-17T10:00:00.000Z");

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sample blog</title>
  <item>
    <title>把编译器讲清楚</title>
    <link>https://example.org/posts/1</link>
    <description>一篇关于编译器前端的长文。</description>
    <pubDate>Sun, 17 Aug 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>再谈类型系统</title>
    <link>https://example.org/posts/2</link>
    <description>类型系统能替你检查什么。</description>
    <pubDate>Sat, 16 Aug 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

function source(overrides: Partial<ChannelSource> = {}): ChannelSource {
  return {
    id: "sample-blog",
    displayName: "示例博客",
    adapterType: "generic-feed",
    endpoint: { feedUrl: "https://example.org/feed" },
    language: "zh-CN",
    defaultKind: "article",
    tone: "both",
    defaultEnabled: true,
    fetchPolicy: {
      minimumIntervalMilliseconds: 60_000,
      dailyRequestBudget: 24,
      userAgentOverride: null,
    },
    ...overrides,
  };
}

afterEach(() => {
  stateRows = [];
  storedChannelSettings = {};
  // The settings row is read once and kept; each case starts from an unread one.
  useDiscoveryChannelSettingsStore.setState({ loaded: false });
});

describe("pollChannelsForCandidates", () => {
  it("turns a feed into candidate items and remembers that the source answered", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(SAMPLE_FEED, { status: 200, headers: { etag: '"v1"' } }),
    );
    const outcome = await pollChannelsForCandidates({
      sources: [source()],
      fetchImplementation,
      now: () => NOW,
    });

    expect(outcome.items.map((item) => item.title)).toEqual(["把编译器讲清楚", "再谈类型系统"]);
    expect(outcome.answeredSourceCount).toBe(1);
    expect(stateRows[0]).toMatchObject({
      source_id: "sample-blog",
      reachable: 1,
      failure_count: 0,
      etag: '"v1"',
    });
  });

  it("says nothing and returns nothing when the source is unreachable", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error("network is down");
    });
    const outcome = await pollChannelsForCandidates({
      sources: [source()],
      fetchImplementation,
      now: () => NOW,
    });
    expect(outcome.items).toEqual([]);
    expect(outcome.answeredSourceCount).toBe(0);
    expect(stateRows[0]).toMatchObject({ reachable: 0, failure_count: 1 });
  });

  it("lets the channels that are up carry the round on their own", async () => {
    const fetchImplementation = vi.fn(async (url: string) => {
      if (url.includes("dead")) throw new Error("no route to host");
      return new Response(SAMPLE_FEED, { status: 200 });
    });
    const outcome = await pollChannelsForCandidates({
      sources: [
        source({ id: "dead-blog", endpoint: { feedUrl: "https://dead.example.org/feed" } }),
        source(),
      ],
      fetchImplementation,
      now: () => NOW,
    });
    expect(outcome.items).toHaveLength(2);
    expect(outcome.answeredSourceCount).toBe(1);
  });

  it("does not knock on the door of a source that is still in backoff", async () => {
    stateRows = [
      {
        source_id: "sample-blog",
        etag: null,
        last_modified: null,
        last_fetch_at: new Date(NOW.getTime() - 30_000).toISOString(),
        reachable: 0,
        failure_count: 5,
        daily_budget_used: 1,
        budget_day: "2026-08-17",
      },
    ];
    const fetchImplementation = vi.fn(async () => new Response(SAMPLE_FEED, { status: 200 }));
    const outcome = await pollChannelsForCandidates({
      sources: [source()],
      fetchImplementation,
      now: () => NOW,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ attemptedSourceCount: 0, answeredSourceCount: 0 });
  });

  it("replays the validators it stored, so an unchanged feed costs almost nothing", async () => {
    stateRows = [
      {
        source_id: "sample-blog",
        etag: '"v1"',
        last_modified: null,
        last_fetch_at: null,
        reachable: 1,
        failure_count: 0,
        daily_budget_used: 0,
        budget_day: null,
      },
    ];
    const fetchImplementation = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(null, { status: 304 }),
    );
    const outcome = await pollChannelsForCandidates({
      sources: [source()],
      fetchImplementation,
      now: () => NOW,
    });
    const headers = fetchImplementation.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["If-None-Match"]).toBe('"v1"');
    expect(outcome.answeredSourceCount).toBe(1);
    expect(outcome.items).toEqual([]);
  });

  it("asks exactly the channels the reader's settings leave on, their own feeds included", async () => {
    const ownFeed = "https://example.org/my-blog/feed";
    const allOff = listCatalogChannelChoices().map((choice) => [choice.id, false]);
    storedChannelSettings = {
      channelEnabledById: Object.fromEntries(allOff),
      userFeedUrls: [ownFeed],
      dataSaverEnabled: true,
    };
    const fetchImplementation = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(SAMPLE_FEED, { status: 200 }),
    );
    const outcome = await pollChannelsForCandidates({ fetchImplementation, now: () => NOW });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(ownFeed);
    expect(outcome.items).toHaveLength(2);
  });
});

const HACKER_NEWS_HITS = JSON.stringify({
  hits: [
    {
      objectID: "42",
      title: "把编译器讲清楚",
      url: "https://example.org/hn/42",
      author: "someone",
      points: 120,
      num_comments: 30,
      created_at: "2026-08-17T08:00:00.000Z",
    },
  ],
});

function hackerNewsSource(): ChannelSource {
  return source({
    id: "hacker-news-front-page",
    adapterType: "hackernews",
    endpoint: { feedUrl: "https://hn.algolia.com/api/v1/search?tags=front_page" },
    defaultKind: "discussion",
  });
}

function podcastSearchSource(): ChannelSource {
  return source({
    id: "podcast-search",
    adapterType: "podcast-search",
    endpoint: { feedUrl: "https://itunes.apple.com/search" },
    defaultKind: "podcast",
  });
}

/**
 * FIXED (2026-08-18, spec 053 T10c). The search path never wrote a channel_state row at all: a
 * launch landed 59 podcast episodes while podcast-search's row still said the source had never
 * been asked, was of unknown reachability and had spent nothing — so freshness, backoff and the
 * diagnostics all read a channel that is plainly working as one nobody had ever reached.
 */
describe("searchChannelsForCandidates", () => {
  it("writes down that it asked, and what answered, for every source it queried", async () => {
    const fetchImplementation = vi.fn(async (url: string) => {
      if (url.includes("itunes")) throw new Error("no route to host");
      return new Response(HACKER_NEWS_HITS, { status: 200 });
    });
    const harvests = await searchChannelsForCandidates(["编译器"], {
      sources: [hackerNewsSource(), podcastSearchSource()],
      fetchImplementation,
      now: () => NOW,
    });

    expect(harvests[0]?.items).toHaveLength(1);
    const byId = new Map(stateRows.map((row) => [row.source_id, row]));
    expect(byId.get("hacker-news-front-page")).toMatchObject({
      last_fetch_at: NOW.toISOString(),
      reachable: 1,
      failure_count: 0,
    });
    // A query is charged to the daily recall budget, not to the source's polling allowance — the
    // one the next poll is gated on.
    expect(byId.get("hacker-news-front-page")?.daily_budget_used).toBe(0);
  });

  it("marks a search source that answered nothing unreachable, and finishes the round anyway", async () => {
    const fetchImplementation = vi.fn(async (url: string) => {
      if (url.includes("itunes")) throw new Error("no route to host");
      return new Response(HACKER_NEWS_HITS, { status: 200 });
    });
    const harvests = await searchChannelsForCandidates(["编译器"], {
      sources: [hackerNewsSource(), podcastSearchSource()],
      fetchImplementation,
      now: () => NOW,
    });

    expect(harvests.map((harvest) => harvest.query)).toEqual(["编译器"]);
    expect(harvests[0]?.items.map((item) => item.title)).toEqual(["把编译器讲清楚"]);
    const podcast = stateRows.find((row) => row.source_id === "podcast-search");
    expect(podcast).toMatchObject({
      last_fetch_at: NOW.toISOString(),
      reachable: 0,
      failure_count: 1,
    });
  });
});
