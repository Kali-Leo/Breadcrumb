/**
 * Purpose: unit tests for the channel catalog — that the file shipped with the app validates and
 * carries only the zero-login sources the channel survey verified, and that malformed or
 * duplicated entries are rejected rather than half-loaded.
 */
import { describe, expect, it } from "vitest";
import { sourceSupportsPolling, sourceSupportsSearch } from "./adapterCapabilities";
import {
  type ChannelCatalog,
  type ChannelSource,
  channelSourceSchema,
  fillSourceTemplate,
  isSourceTemplate,
  loadStarterChannelCatalog,
  parseChannelCatalog,
} from "./channelCatalog";

const exampleSource = {
  id: "example",
  displayName: "Example",
  adapterType: "generic-feed",
  endpoint: { feedUrl: "https://example.com/feed" },
  language: "en",
  defaultKind: "article",
  defaultEnabled: true,
  fetchPolicy: {
    minimumIntervalMilliseconds: 1_800_000,
    dailyRequestBudget: 48,
    userAgentOverride: null,
  },
};

function catalogWith(sources: unknown[]): Record<string, unknown> {
  return { formatVersion: 1, revisedOn: "2026-08-17", sources };
}

describe("loadStarterChannelCatalog", () => {
  const catalog: ChannelCatalog = loadStarterChannelCatalog();

  it("validates the bundled file", () => {
    expect(catalog.formatVersion).toBe(1);
    expect(catalog.sources.length).toBeGreaterThan(0);
  });

  it("gives every source a distinct id and a distinct address", () => {
    const ids = catalog.sources.map((source) => source.id);
    const urls = catalog.sources.map((source) => source.endpoint.feedUrl);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  /** Every address is fetched over TLS, including the ones whose publisher offers plain http. */
  it("reaches every source over https", () => {
    for (const source of catalog.sources) {
      expect(source.endpoint.feedUrl.startsWith("https://")).toBe(true);
    }
  });

  /**
   * Spec 054, Leo's second point: the feed is about to be filtered by the reader's language, so a
   * source that does not say what it publishes in would silently vanish or silently intrude. "und"
   * is allowed only for the search-only entry, whose language is whatever the reader typed.
   */
  it("has every source declare the language it publishes in", () => {
    for (const source of catalog.sources) {
      const publishesItself = sourceSupportsPolling(source) || isSourceTemplate(source);
      expect([source.id, source.language]).toEqual([
        source.id,
        expect.stringMatching(publishesItself ? /^(zh-CN|en)$/ : /^(zh-CN|en|und)$/),
      ]);
    }
    expect(catalog.sources.filter((source) => source.language === "und")).toHaveLength(1);
  });

  /** Leo's ninth point was that the sources look few and dated; the answer was not more text
   * feeds but the two categories that were missing entirely, and pictures on the rest. */
  it("ships video and podcast channels, not only articles and discussions", () => {
    const kinds = new Set(catalog.sources.map((source) => source.defaultKind));
    expect(kinds).toContain("video");
    expect(kinds).toContain("podcast");
    const byAdapter = (type: string): string[] =>
      catalog.sources.filter((source) => source.adapterType === type).map((source) => source.id);
    expect(byAdapter("bilibili-ranking")).toEqual([
      "bilibili-knowledge",
      "bilibili-technology",
      "bilibili-must-watch",
    ]);
    expect(byAdapter("podcast-charts")).toEqual([
      "podcast-chart-education",
      "podcast-chart-history",
      "podcast-chart-science",
    ]);
    expect(byAdapter("wikipedia-featured")).toEqual(["wikipedia-zh-featured"]);
  });

  /** The three addresses the 2026-08-18 survey measured answering with no cookie and no wbi
   * signature. Only a handful of rid values work at all, so these are not interchangeable. */
  it("ships only the bilibili lists that answer an anonymous request", () => {
    const bilibili = catalog.sources.filter((source) => source.adapterType === "bilibili-ranking");
    expect(bilibili.map((source) => source.endpoint.feedUrl)).toEqual([
      "https://api.bilibili.com/x/web-interface/ranking/v2?rid=36&type=all",
      "https://api.bilibili.com/x/web-interface/ranking/v2?rid=188&type=all",
      "https://api.bilibili.com/x/web-interface/popular/precious",
    ]);
  });

  /** The country top-50 is deliberately absent: the survey found it dominated by chat shows. */
  it("takes podcasts from the three learning category charts", () => {
    const charts = catalog.sources.filter((source) => source.adapterType === "podcast-charts");
    for (const chart of charts) {
      expect(chart.endpoint.feedUrl).toMatch(/\/rss\/toppodcasts\/limit=50\/genre=\d+\/json$/);
      expect(chart.endpoint.showFeedsPerPoll).toBeGreaterThan(0);
      expect(chart.defaultKind).toBe("podcast");
    }
    expect(
      charts.map((chart) => new URL(chart.endpoint.feedUrl).pathname.split("genre=")[1]),
    ).toEqual(["1304/json", "1487/json", "1533/json"]);
  });

  it("marks as unverified exactly the addresses the survey did not record", () => {
    const unverified = catalog.sources.filter((source) => source.unverified === true);
    expect(unverified.map((source) => source.id)).toEqual([
      "arxiv-cs-ai",
      "arxiv-cs-lg",
      "arxiv-q-bio-nc",
    ]);
  });

  it("gives every source a positive interval and a daily budget", () => {
    for (const source of catalog.sources) {
      expect(source.fetchPolicy.minimumIntervalMilliseconds).toBeGreaterThan(0);
      expect(source.fetchPolicy.dailyRequestBudget).toBeGreaterThan(0);
    }
  });

  it("overrides the User-Agent only for linux.do, which 403s a library one", () => {
    const overriding = catalog.sources.filter(
      (source) => source.fetchPolicy.userAgentOverride !== null,
    );
    expect(overriding.map((source) => source.id)).toEqual(["linux-do"]);
    expect(overriding[0]?.fetchPolicy.userAgentOverride).toMatch(/^Mozilla\/5\.0/);
  });

  it("leaves the 豆瓣 entry off until the reader supplies a user id", () => {
    const douban = catalog.sources.find((source) => source.id === "douban-interests");
    expect(douban?.defaultEnabled).toBe(false);
    expect(douban && isSourceTemplate(douban)).toBe(true);
    expect(douban && sourceSupportsPolling(douban)).toBe(false);
  });

  it("keeps the podcast search out of the polling rotation and in the search rotation", () => {
    const itunes = catalog.sources.find((source) => source.id === "podcast-search");
    expect(itunes && sourceSupportsPolling(itunes)).toBe(false);
    expect(itunes && sourceSupportsSearch(itunes)).toBe(true);
  });

  /**
   * Spec 053 §1 lists YouTube among the first-wave channels, and until spec 053 T10 the shipped
   * catalog had no entry for it at all, so a fresh install saw no video on the grid. Each address
   * below was fetched on 2026-08-17 and answered with an Atom document carrying 15 entries.
   *
   * The 2026-08-18 survey then found the same addresses answering with nothing minutes later, so
   * the channels stay and the polls got rarer: half a day between them, four a day at most.
   */
  it("ships the three YouTube channels a fresh install starts with, polled rarely", () => {
    const youtube = catalog.sources.filter((source) => source.adapterType === "youtube-channel");
    expect(youtube.map((source) => source.displayName)).toEqual([
      "3Blue1Brown",
      "Veritasium",
      "Kurzgesagt – In a Nutshell",
    ]);
    for (const source of youtube) {
      expect(new URL(source.endpoint.feedUrl).searchParams.get("channel_id")).toMatch(/^UC/);
      expect(source.defaultKind).toBe("video");
      expect(source.defaultEnabled).toBe(true);
      expect(source.unverified).toBeUndefined();
      expect(source.fetchPolicy.minimumIntervalMilliseconds).toBe(12 * 60 * 60 * 1000);
    }
  });

  /** An interval is a promise to the publisher, so it tracks how often they actually publish:
   * IT之家 ships sixty items a pull and 美团技术 posts weekly, and they must not be polled alike. */
  it("polls each source about as often as it publishes", () => {
    const intervalOf = (id: string): number => {
      const source = catalog.sources.find((one) => one.id === id);
      if (!source) throw new Error(`missing source ${id}`);
      return source.fetchPolicy.minimumIntervalMilliseconds;
    };
    expect(intervalOf("ithome")).toBeLessThan(intervalOf("geekpark"));
    expect(intervalOf("geekpark")).toBeLessThan(intervalOf("meituan-tech"));
    expect(intervalOf("meituan-tech")).toBe(24 * 60 * 60 * 1000);
    expect(intervalOf("nasa-image-of-the-day")).toBe(12 * 60 * 60 * 1000);
    // 入站必刷 is an evergreen list; the daily rankings move and are read four times a day.
    expect(intervalOf("bilibili-must-watch")).toBeGreaterThan(intervalOf("bilibili-knowledge"));
  });

  it("enables every other source on a fresh install", () => {
    const disabled = catalog.sources.filter((source) => !source.defaultEnabled);
    expect(disabled.map((source) => source.id)).toEqual(["douban-interests"]);
  });
});

function starterSource(id: string): ChannelSource {
  const source = loadStarterChannelCatalog().sources.find((one) => one.id === id);
  if (!source) throw new Error(`missing starter source ${id}`);
  return source;
}

describe("fillSourceTemplate", () => {
  const template = starterSource("douban-interests");

  it("substitutes the reader's id and leaves a source that can be polled", () => {
    const filled = fillSourceTemplate(template, { userId: "ahbei" });
    expect(filled.endpoint.feedUrl).toBe("https://www.douban.com/feed/people/ahbei/interests");
    expect(isSourceTemplate(filled)).toBe(false);
    expect(sourceSupportsPolling(filled)).toBe(true);
  });

  it("encodes a pasted value so it cannot rewrite the path", () => {
    const filled = fillSourceTemplate(template, { userId: "../../secret" });
    expect(filled.endpoint.feedUrl).toBe(
      "https://www.douban.com/feed/people/..%2F..%2Fsecret/interests",
    );
  });

  it("refuses a blank value rather than fetching an address with a hole in it", () => {
    expect(() => fillSourceTemplate(template, { userId: "  " })).toThrow(
      /missing template parameter/,
    );
  });
});

describe("parseChannelCatalog", () => {
  it("rejects duplicate source ids", () => {
    expect(() => parseChannelCatalog(catalogWith([exampleSource, exampleSource]))).toThrow(
      /duplicate channel source id/,
    );
  });

  it("rejects an unknown adapter type and a non-url endpoint", () => {
    expect(() =>
      parseChannelCatalog(catalogWith([{ ...exampleSource, adapterType: "telepathy" }])),
    ).toThrow();
    expect(() =>
      parseChannelCatalog(catalogWith([{ ...exampleSource, endpoint: { feedUrl: "not a url" } }])),
    ).toThrow();
  });

  it("rejects a future format version and an empty source list", () => {
    expect(() =>
      parseChannelCatalog({ ...catalogWith([exampleSource]), formatVersion: 2 }),
    ).toThrow();
    expect(() => parseChannelCatalog(catalogWith([]))).toThrow();
  });

  it("accepts a user-pasted source of the same shape", () => {
    const pasted = channelSourceSchema.parse({
      ...exampleSource,
      id: "my-blog",
      endpoint: { feedUrl: "https://blog.example.org/atom.xml" },
    });
    expect(pasted.id).toBe("my-blog");
  });
});
