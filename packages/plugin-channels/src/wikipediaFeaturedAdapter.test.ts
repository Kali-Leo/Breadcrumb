/**
 * Purpose: tests for the Wikipedia featured-content adapter against a payload shaped like the live
 * one — that the date goes into the address rather than into a settings blank, that a most-read
 * entry with no picture is left out rather than shipped as another grey card, and that the picture
 * of the day comes through as a card of its own.
 */
import { describe, expect, it } from "vitest";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import {
  buildWikipediaFeaturedUrl,
  fetchWikipediaFeaturedSource,
  parseWikipediaFeatured,
  wikipediaFeaturedUrlTemplate,
} from "./wikipediaFeaturedAdapter";

const observedAt = new Date("2026-08-18T02:00:00.000Z");

/** The day before the observed one, which is the day the adapter asks for. */
const askedForUrl = "https://api.wikimedia.org/feed/v1/wikipedia/zh/featured/2026/08/17";

const featuredBody = JSON.stringify({
  tfa: { title: "今日典范条目" },
  mostread: {
    date: "2026-08-17Z",
    articles: [
      {
        views: 200_000,
        rank: 1,
        title: "牛来",
        titles: { normalized: "牛来", canonical: "牛来" },
        extract: "《牛来》是由信雨萌执导的中国动画电影。",
        description: "2026年的中国动画电影",
        thumbnail: { source: "https://upload.wikimedia.org/wikipedia/zh/0/07/NiuLai.jpg" },
        content_urls: { desktop: { page: "https://zh.wikipedia.org/wiki/%E7%89%9B%E6%9D%A5" } },
      },
      {
        views: 40_000,
        rank: 2,
        title: "没有配图的条目",
        extract: "这条没有缩略图。",
        content_urls: { desktop: { page: "https://zh.wikipedia.org/wiki/A" } },
      },
    ],
  },
  image: {
    title: "File:Westruper Heide.jpg",
    thumbnail: {
      source: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/heide/960px-heide.jpg",
    },
    file_page: "https://commons.wikimedia.org/wiki/File:Westruper_Heide.jpg",
    description: { text: "清晨石楠花期中的一棵孤树。", lang: "zh" },
  },
  onthisday: [],
});

const source = fakeChannelSource({
  id: "wikipedia-zh-featured",
  adapterType: "wikipedia-featured",
  endpoint: { feedUrl: wikipediaFeaturedUrlTemplate },
  defaultKind: "article",
  language: "zh-CN",
});

describe("buildWikipediaFeaturedUrl", () => {
  it("asks for the day before the observed one, in UTC, zero-padded", () => {
    expect(buildWikipediaFeaturedUrl(wikipediaFeaturedUrlTemplate, observedAt)).toBe(askedForUrl);
    expect(
      buildWikipediaFeaturedUrl(wikipediaFeaturedUrlTemplate, new Date("2026-01-01T00:30:00Z")),
    ).toBe("https://api.wikimedia.org/feed/v1/wikipedia/zh/featured/2025/12/31");
  });
});

describe("parseWikipediaFeatured", () => {
  const day = new Date("2026-08-17T00:00:00.000Z");
  const parsed = parseWikipediaFeatured("wikipedia-zh-featured", featuredBody, day);

  it("leads with the picture of the day and gives it the caption as its title", () => {
    const [picture] = parsed.items;
    expect(picture?.id).toBe("wikipedia-zh-featured:picture-of-the-day:2026-08-17");
    expect(picture?.title).toBe("清晨石楠花期中的一棵孤树。");
    expect(picture?.url).toBe("https://commons.wikimedia.org/wiki/File:Westruper_Heide.jpg");
    expect(picture?.coverUrl).toContain("960px-heide.jpg");
    expect(picture?.upstreamSignal).toBeNull();
  });

  it("maps a most-read article onto the candidate contract", () => {
    const article = parsed.items[1];
    expect(article?.title).toBe("牛来");
    expect(article?.url).toBe("https://zh.wikipedia.org/wiki/%E7%89%9B%E6%9D%A5");
    expect(article?.coverUrl).toBe("https://upload.wikimedia.org/wikipedia/zh/0/07/NiuLai.jpg");
    expect(article?.summary).toBe("《牛来》是由信雨萌执导的中国动画电影。");
    expect(article?.publishedAt).toBe("2026-08-17T00:00:00.000Z");
    expect(article?.upstreamSignal).toBe(1);
  });

  it("leaves out a most-read entry with no picture", () => {
    expect(parsed.items).toHaveLength(2);
    expect(parsed.skippedEntryCount).toBe(1);
    expect(parsed.items.map((item) => item.title)).not.toContain("没有配图的条目");
  });

  it("reports a body that is not this feed rather than throwing", () => {
    expect(parseWikipediaFeatured("s", "<html>", day).parseError).not.toBeNull();
    expect(parseWikipediaFeatured("s", JSON.stringify({ mostread: 7 }), day).parseError).toBe(
      "not a Wikipedia featured feed",
    );
  });
});

describe("fetchWikipediaFeaturedSource", () => {
  it("polls the dated address, not the template", async () => {
    const { context, requests } = fakeFetchContext({ [askedForUrl]: featuredBody });
    const result = await fetchWikipediaFeaturedSource(source, context, observedAt);

    expect(requests[0]?.url).toBe(askedForUrl);
    expect(requests[0]?.kind).toBe("poll");
    expect(requests[0]?.accept).toContain("application/json");
    expect(result.items).toHaveLength(2);
    for (const item of result.items) expect(item.coverUrl).not.toBeNull();
  });

  it("stays quiet when the day has no feed yet", async () => {
    const result = await fetchWikipediaFeaturedSource(
      source,
      fakeFetchContext({}).context,
      observedAt,
    );
    expect(result.outcome.status).toBe("failed");
    expect(result.items).toEqual([]);
  });
});
