/**
 * Purpose: unit tests for the polling round — a real RSS payload becomes candidate items through
 * the real fetcher and adapter (only the socket is faked), a source in backoff is not asked at
 * all, a dead source costs the round nothing but itself, and every poll's outcome is written to
 * channel_state so the next launch starts where this one left off.
 */
import type { ChannelStateRow } from "@breadcrumb/core-db";
import type { ChannelSource } from "@breadcrumb/plugin-channels";
import { afterEach, describe, expect, it, vi } from "vitest";

let stateRows: ChannelStateRow[] = [];

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    channelState: {
      get: async (sourceId: string) => stateRows.find((row) => row.source_id === sourceId) ?? null,
      listAll: async () => stateRows,
      upsert: async (row: ChannelStateRow) => {
        stateRows = [...stateRows.filter((existing) => existing.source_id !== row.source_id), row];
      },
    },
  })),
}));

const { pollChannelsForCandidates } = await import("./discoveryChannels");

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
});
