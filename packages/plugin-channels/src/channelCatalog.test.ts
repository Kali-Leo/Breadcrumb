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
  channelToneSchema,
  fillSourceTemplate,
  isSourceTemplate,
  loadStarterChannelCatalog,
  parseChannelCatalog,
} from "./channelCatalog";
import starterCatalogJson from "./starterChannelCatalog.json" with { type: "json" };

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
    expect(byAdapter("podcast-charts")).toEqual([
      "podcast-chart-education",
      "podcast-chart-history",
      "podcast-chart-science",
    ]);
    expect(byAdapter("wikipedia-featured")).toEqual(["wikipedia-zh-featured"]);
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

  /**
   * Spec 054, Leo's eighth point: the feed's two modes are a filter, not a preference, so a
   * source that never said who it is written for would silently pick a side. The schema fills in
   * "both" for feeds the reader pastes in, which is why this reads the file rather than the
   * parsed catalog — a new entry that forgets the field must fail here, not default quietly.
   */
  it("has every shipped source say which mode it belongs in", () => {
    for (const source of starterCatalogJson.sources as { id: string; tone?: unknown }[]) {
      expect([source.id, channelToneSchema.safeParse(source.tone).success]).toEqual([
        source.id,
        true,
      ]);
    }
  });

  /** Neither mode may be left with nothing to show, so the split is checked as a split: each
   * side needs sources of its own, and the sources that genuinely serve both moods stay in both. */
  it("leaves both modes with sources in every language", () => {
    const tones = (language: string, tone: string): string[] =>
      catalog.sources
        .filter((source) => source.language === language && source.tone === tone)
        .map((source) => source.id);
    for (const language of ["zh-CN", "en"]) {
      expect(tones(language, "professional").length).toBeGreaterThan(2);
      expect(tones(language, "casual").length).toBeGreaterThan(2);
      expect(tones(language, "both").length).toBeGreaterThan(2);
    }
    // Papers are the clearest case of a source that reads wrong when the reader wanted to browse.
    for (const source of catalog.sources.filter((one) => one.defaultKind === "paper")) {
      expect([source.id, source.tone]).toEqual([source.id, "professional"]);
    }
  });

  it("gives every source a positive interval and a daily budget", () => {
    for (const source of catalog.sources) {
      expect(source.fetchPolicy.minimumIntervalMilliseconds).toBeGreaterThan(0);
      expect(source.fetchPolicy.dailyRequestBudget).toBeGreaterThan(0);
    }
  });

  /** Both hosts answer 403 to a library User-Agent and 200 to a browser one — measured on
   * linux.do in the 2026-08-17 survey and on solidot.org again on 2026-08-18. Nothing else in the
   * catalog needs the string, and a source that does not need it must not claim to be a browser. */
  it("overrides the User-Agent only for the two hosts that 403 a library one", () => {
    const overriding = catalog.sources.filter(
      (source) => source.fetchPolicy.userAgentOverride !== null,
    );
    expect(overriding.map((source) => source.id)).toEqual(["solidot", "linux-do"]);
    for (const source of overriding) {
      expect(source.fetchPolicy.userAgentOverride).toMatch(/^Mozilla\/5\.0/);
    }
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
    // cnBeta answers with 150 items covering the last 33 hours, about 110 a day — the widest
    // window in the catalog. Polled every six hours it still brings roughly thirty new items a
    // round, which is why it is read more rarely than 奇客 Solidot, whose 20-item window holds
    // three days of posts and would otherwise scroll past unnoticed.
    expect(intervalOf("cnbeta")).toBe(6 * 60 * 60 * 1000);
    expect(intervalOf("solidot")).toBe(60 * 60 * 1000);
    expect(intervalOf("solidot")).toBeLessThan(intervalOf("cnbeta"));
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
    // Nothing is known about a pasted address, so it is shown in both modes rather than hidden.
    expect(pasted.tone).toBe("both");
  });

  it("rejects a mode nobody can filter on", () => {
    expect(() =>
      parseChannelCatalog(catalogWith([{ ...exampleSource, tone: "serious" }])),
    ).toThrow();
  });
});
