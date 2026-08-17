/**
 * Purpose: tests for the one call the discovery pipeline makes to poll a source — that every
 * adapter family is reachable through it, that a template nobody has filled in and a search-only
 * source are skipped with a reason instead of being asked for a feed, and that a poll of a dead
 * source is an empty result rather than an exception.
 */
import { describe, expect, it } from "vitest";
import { fetchLatestFromSource } from "./sourceFetchFacade";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const blogRss = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Blog</title><link>https://blog.example.com</link><description>d</description>
  <item><title>A post</title><link>https://blog.example.com/1</link><guid>1</guid>
  <description>Body.</description></item>
</channel></rss>`;

describe("fetchLatestFromSource", () => {
  it("polls an ordinary feed through the generic adapter", async () => {
    const source = fakeChannelSource({ endpoint: { feedUrl: "https://blog.example.com/feed" } });
    const { context, requests } = fakeFetchContext({
      "https://blog.example.com/feed": blogRss,
    });
    const result = await fetchLatestFromSource(source, context, observedAt);

    expect(requests[0]?.kind).toBe("poll");
    expect(result.items.map((item) => item.title)).toEqual(["A post"]);
  });

  it("sends 豆瓣's filled-in feed through the generic adapter too", async () => {
    const source = fakeChannelSource({
      id: "douban-interests",
      adapterType: "douban-user",
      endpoint: { feedUrl: "https://www.douban.com/feed/people/ahbei/interests" },
    });
    const { context } = fakeFetchContext({
      "https://www.douban.com/feed/people/ahbei/interests": blogRss,
    });
    expect((await fetchLatestFromSource(source, context, observedAt)).items).toHaveLength(1);
  });

  it("routes each specialized family to its own adapter", async () => {
    const cases = [
      { adapterType: "v2ex" as const, feedUrl: "https://www.v2ex.com/api/topics/hot.json" },
      {
        adapterType: "hackernews" as const,
        feedUrl: "https://hn.algolia.com/api/v1/search?tags=front_page",
      },
    ];
    for (const one of cases) {
      const source = fakeChannelSource({
        adapterType: one.adapterType,
        endpoint: { feedUrl: one.feedUrl },
        defaultKind: "discussion",
      });
      const { context, requests } = fakeFetchContext({ [one.feedUrl]: "[]" });
      const result = await fetchLatestFromSource(source, context, observedAt);
      expect(requests[0]?.url).toBe(one.feedUrl);
      expect(requests[0]?.accept).toContain("application/json");
      expect(result.items).toEqual([]);
    }
  });

  it("skips a template whose parameters the reader has not filled in", async () => {
    const source = fakeChannelSource({
      adapterType: "douban-user",
      endpoint: { feedUrl: "https://www.douban.com/feed/people/{userId}/interests" },
      templateParameters: [{ name: "userId", label: "豆瓣用户 ID" }],
    });
    const { context, requests } = fakeFetchContext({});
    const result = await fetchLatestFromSource(source, context, observedAt);

    expect(result.outcome).toEqual({ status: "skipped", reason: "template-not-filled" });
    expect(requests).toEqual([]);
  });

  it("skips a search-only source instead of asking it for a feed", async () => {
    const source = fakeChannelSource({
      adapterType: "podcast-search",
      endpoint: { feedUrl: "https://itunes.apple.com/search" },
      defaultKind: "podcast",
    });
    const { context, requests } = fakeFetchContext({});
    const result = await fetchLatestFromSource(source, context, observedAt);

    expect(result.outcome).toEqual({ status: "skipped", reason: "not-pollable" });
    expect(requests).toEqual([]);
  });

  it("passes a skip or a failure straight through with no items", async () => {
    const source = fakeChannelSource({ endpoint: { feedUrl: "https://gone.example.com/feed" } });
    const { context } = fakeFetchContext({
      "https://gone.example.com/feed": { status: "not-modified" },
    });
    const unchanged = await fetchLatestFromSource(source, context, observedAt);
    expect(unchanged.outcome.status).toBe("not-modified");
    expect(unchanged.items).toEqual([]);

    const dead = await fetchLatestFromSource(source, fakeFetchContext({}).context, observedAt);
    expect(dead.outcome.status).toBe("failed");
    expect(dead.parseError).toBeNull();
  });
});
