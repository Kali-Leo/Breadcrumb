/**
 * Purpose: unit tests for the channel catalog — that the file shipped with the app validates and
 * carries only the zero-login sources the channel survey verified, and that malformed or
 * duplicated entries are rejected rather than half-loaded.
 */
import { describe, expect, it } from "vitest";
import {
  type ChannelCatalog,
  channelSourceSchema,
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
    ]);
  });

  it("enables every starter source by default and needs no custom User-Agent", () => {
    for (const source of catalog.sources) {
      expect(source.defaultEnabled).toBe(true);
      expect(source.adapterType).toBe("generic-feed");
      expect(source.fetchPolicy.userAgentOverride).toBeNull();
      expect(source.fetchPolicy.minimumIntervalMilliseconds).toBeGreaterThan(0);
    }
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
      parseChannelCatalog(catalogWith([{ ...exampleSource, adapterType: "discourse" }])),
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
