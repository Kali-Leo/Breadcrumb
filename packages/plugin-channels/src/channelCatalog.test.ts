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

  it("ships exactly the feed addresses the channel survey verified", () => {
    expect(catalog.sources.map((source) => source.endpoint.feedUrl)).toEqual([
      "https://sspai.com/feed",
      "https://juejin.cn/rss",
      "https://segmentfault.com/feeds",
      "https://www.cnblogs.com/rss",
      "https://rss.sina.com.cn/tech/rollnews.xml",
      "https://linux.do/latest.rss",
      "https://www.v2ex.com/api/topics/hot.json",
      "https://hn.algolia.com/api/v1/search?tags=front_page",
      "https://rss.arxiv.org/rss/cs.AI",
      "https://rss.arxiv.org/rss/cs.LG",
      "https://rss.arxiv.org/rss/q-bio.NC",
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw",
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q",
      "https://itunes.apple.com/search",
      "https://www.douban.com/feed/people/{userId}/interests",
    ]);
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

  /** Spec 053 §1 lists YouTube among the first-wave channels, and until spec 053 T10 the shipped
   * catalog had no entry for it at all, so a fresh install saw no video on the grid. Each address
   * below was fetched on 2026-08-17 and answered with an Atom document carrying 15 entries. */
  it("ships the three YouTube channels a fresh install starts with", () => {
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
    }
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
