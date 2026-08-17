/**
 * Purpose: tests for the active-recall fan-out — that one term reaches every channel that accepts
 * a query and no channel that does not, that several catalog entries of the same family cost one
 * query rather than three, and that a channel which is down or slow quietly contributes nothing
 * instead of taking the whole recall run down with it.
 */
import { describe, expect, it } from "vitest";
import { buildArxivSearchUrl } from "./arxivAdapter";
import { buildHackerNewsSearchUrl } from "./hackerNewsAdapter";
import { buildItunesSearchUrl } from "./podcastSearchAdapter";
import { RequestPacer } from "./requestPacer";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import { searchTopics } from "./topicSearch";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const instantPacer = new RequestPacer({
  minimumIntervalMilliseconds: 3_000,
  now: () => 0,
  sleep: async () => undefined,
});

const hackerNews = fakeChannelSource({
  id: "hacker-news-front-page",
  adapterType: "hackernews",
  endpoint: { feedUrl: "https://hn.algolia.com/api/v1/search?tags=front_page" },
  defaultKind: "discussion",
});

const arxivFirst = fakeChannelSource({
  id: "arxiv-cs-ai",
  adapterType: "arxiv",
  endpoint: { feedUrl: "https://rss.arxiv.org/rss/cs.AI" },
  defaultKind: "paper",
});

const arxivSecond = fakeChannelSource({
  id: "arxiv-cs-lg",
  adapterType: "arxiv",
  endpoint: { feedUrl: "https://rss.arxiv.org/rss/cs.LG" },
  defaultKind: "paper",
});

const podcasts = fakeChannelSource({
  id: "podcast-search",
  adapterType: "podcast-search",
  endpoint: { feedUrl: "https://itunes.apple.com/search" },
  defaultKind: "podcast",
});

const blog = fakeChannelSource({ id: "sspai", endpoint: { feedUrl: "https://sspai.com/feed" } });

const algoliaHits = JSON.stringify({
  hits: [
    {
      objectID: "1",
      title: "A thread about memory",
      url: "https://example.org/memory",
      points: 120,
      author: "someone",
      created_at: "2026-08-16T12:00:00Z",
    },
  ],
});

const arxivAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2607.09876v1</id>
    <title>A paper about memory</title>
    <summary>An abstract.</summary>
    <published>2026-07-29T10:00:00Z</published>
    <link href="http://arxiv.org/abs/2607.09876v1" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

const itunesEpisodes = JSON.stringify({
  results: [
    {
      wrapperType: "podcastEpisode",
      trackId: 42,
      trackName: "An episode about memory",
      collectionName: "A Show",
      episodeUrl: "https://audio.example.com/42.mp3",
      description: "Notes.",
      releaseDate: "2026-08-01T00:00:00Z",
    },
  ],
});

function fixturesFor(query: string): Record<string, string> {
  return {
    [buildHackerNewsSearchUrl(hackerNews, query)]: algoliaHits,
    [buildArxivSearchUrl(query)]: arxivAtom,
    [buildItunesSearchUrl(podcasts, query, "podcastEpisode")]: itunesEpisodes,
  };
}

describe("searchTopics", () => {
  const sources = [blog, hackerNews, arxivFirst, arxivSecond, podcasts];

  it("asks every searchable family once and leaves the polling-only sources alone", async () => {
    const { context, requests } = fakeFetchContext(fixturesFor("memory"));
    const items = await searchTopics("memory", sources, context, {
      arxivPacer: instantPacer,
      observedAt,
    });

    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.kind === "follow-up")).toBe(true);
    expect(requests.some((request) => request.url.includes("sspai"))).toBe(false);
    expect(items.map((item) => item.kind)).toEqual(["discussion", "paper", "podcast"]);
  });

  it("returns fewer results, not an error, when a channel is unreachable", async () => {
    const fixtures = fixturesFor("memory");
    const { [buildArxivSearchUrl("memory")]: _unreachable, ...rest } = fixtures;
    const { context } = fakeFetchContext(rest);
    const items = await searchTopics("memory", sources, context, {
      arxivPacer: instantPacer,
      observedAt,
    });

    expect(items.map((item) => item.kind)).toEqual(["discussion", "podcast"]);
  });

  it("gives each source the context bound to its own budget when asked to", async () => {
    const seen: string[] = [];
    const { context } = fakeFetchContext(fixturesFor("memory"));
    await searchTopics("memory", sources, context, {
      arxivPacer: instantPacer,
      observedAt,
      contextForSource: (source) => {
        seen.push(source.id);
        return context;
      },
    });

    expect(seen).toEqual(["hacker-news-front-page", "arxiv-cs-ai", "podcast-search"]);
  });

  it("does nothing at all for a blank term", async () => {
    const { context, requests } = fakeFetchContext(fixturesFor("memory"));
    expect(await searchTopics("   ", sources, context, { arxivPacer: instantPacer })).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("returns nothing when none of the given sources answers queries", async () => {
    const { context, requests } = fakeFetchContext(fixturesFor("memory"));
    expect(await searchTopics("memory", [blog], context)).toEqual([]);
    expect(requests).toEqual([]);
  });
});
