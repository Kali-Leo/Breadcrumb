/**
 * Purpose: tests for the Hacker News adapter against an Algolia payload shaped like the live API's
 * — that a link post keeps its outside address while a text post falls back to its thread, that
 * points become the crowd signal, that comment hits (which carry no title) drop out, and that a
 * search builds the documented query and degrades to no results rather than an error.
 */
import { describe, expect, it } from "vitest";
import {
  buildHackerNewsSearchUrl,
  fetchHackerNewsSource,
  parseAlgoliaHits,
  searchHackerNews,
} from "./hackerNewsAdapter";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const frontPage = JSON.stringify({
  hits: [
    {
      objectID: "49319556",
      title: "A paper about spaced repetition",
      url: "https://example.org/spacing",
      author: "tosh",
      points: 722,
      num_comments: 273,
      created_at: "2026-08-16T12:48:21Z",
    },
    {
      objectID: "49319999",
      title: "Ask HN: how do you take notes?",
      url: null,
      author: "curious",
      points: 40,
      created_at: "2026-08-16T10:00:00Z",
      story_text: "<p>I have tried everything.</p>",
    },
    { objectID: "49320000", comment_text: "a reply with no title", author: "someone" },
  ],
  nbHits: 3,
});

const source = fakeChannelSource({
  id: "hacker-news-front-page",
  adapterType: "hackernews",
  endpoint: { feedUrl: "https://hn.algolia.com/api/v1/search?tags=front_page" },
  defaultKind: "discussion",
});

describe("parseAlgoliaHits", () => {
  const result = parseAlgoliaHits(source.id, frontPage, observedAt);

  it("keeps the stories and drops the comment hit", () => {
    expect(result.items.map((item) => item.id)).toEqual([
      "hacker-news-front-page:49319556",
      "hacker-news-front-page:49319999",
    ]);
    expect(result.skippedEntryCount).toBe(1);
  });

  it("keeps a link post pointing at the article and sends a text post to its thread", () => {
    expect(result.items[0]?.url).toBe("https://example.org/spacing");
    expect(result.items[1]?.url).toBe("https://news.ycombinator.com/item?id=49319999");
    expect(result.items[1]?.summary).toBe("I have tried everything.");
  });

  it("calls everything a discussion and reads points as the crowd signal", () => {
    expect(result.items.every((item) => item.kind === "discussion")).toBe(true);
    expect(result.items[0]?.upstreamSignal).toBeCloseTo(
      normalizeCountToSignal(722, saturationCounts.hackerNewsPoints),
      10,
    );
    expect(result.items[0]?.publishedAt).toBe("2026-08-16T12:48:21.000Z");
  });

  it("reports a parse error instead of throwing on a body that is not the API's", () => {
    expect(parseAlgoliaHits(source.id, "<html>").parseError).not.toBeNull();
    expect(parseAlgoliaHits(source.id, "{}").parseError).toBe("algolia response has no hits array");
  });
});

describe("fetchHackerNewsSource", () => {
  it("polls the front-page query", async () => {
    const { context, requests } = fakeFetchContext({
      "https://hn.algolia.com/api/v1/search?tags=front_page": frontPage,
    });
    const result = await fetchHackerNewsSource(source, context, observedAt);
    expect(requests[0]?.kind).toBe("poll");
    expect(result.items).toHaveLength(2);
  });
});

describe("searchHackerNews", () => {
  it("builds a newest-first story query from the source's own address", () => {
    expect(buildHackerNewsSearchUrl(source, "spaced repetition", { hitsPerPage: 5 })).toBe(
      "https://hn.algolia.com/api/v1/search_by_date?query=spaced+repetition&tags=story&hitsPerPage=5",
    );
    expect(buildHackerNewsSearchUrl(source, "x", { ordering: "by-relevance" })).toContain(
      "/api/v1/search?query=x",
    );
  });

  it("returns the hits the query found", async () => {
    const searchUrl = buildHackerNewsSearchUrl(source, "notes");
    const { context, requests } = fakeFetchContext({ [searchUrl]: frontPage });
    const items = await searchHackerNews("notes", source, context, { observedAt });
    expect(items).toHaveLength(2);
    expect(requests[0]?.kind).toBe("follow-up");
  });

  it("returns nothing for a blank query and nothing when the search fails", async () => {
    const { context, requests } = fakeFetchContext({});
    expect(await searchHackerNews("   ", source, context)).toEqual([]);
    expect(requests).toEqual([]);
    expect(await searchHackerNews("notes", source, context)).toEqual([]);
  });
});
