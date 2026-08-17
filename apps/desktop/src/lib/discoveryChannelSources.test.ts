/**
 * Purpose: unit tests for turning the reader's source settings into a polling list — the catalog
 * default when they never touched a switch, a switched-off channel staying home, the 豆瓣 entry
 * waiting for an id and then joining with the id in its address, pasted feeds becoming ordinary
 * generic-feed sources, and a broken pasted line costing nothing but itself.
 */
import { describe, expect, it } from "vitest";
import {
  buildEnabledChannelSources,
  listCatalogChannelChoices,
  userFeedSourceId,
} from "./discoveryChannelSources";

const NOTHING_CHOSEN = { channelEnabledById: {}, userFeedUrls: [], doubanUserId: "" };

function idsOf(sources: readonly { id: string }[]): string[] {
  return sources.map((source) => source.id);
}

describe("buildEnabledChannelSources", () => {
  it("follows the catalog's own defaults when the reader has changed nothing", () => {
    const ids = idsOf(buildEnabledChannelSources(NOTHING_CHOSEN));
    const defaults = listCatalogChannelChoices()
      .filter((choice) => choice.defaultEnabled)
      .map((choice) => choice.id);
    expect(ids).toEqual(defaults);
    expect(ids).not.toContain("douban-interests");
  });

  it("leaves out a channel the reader switched off", () => {
    const ids = idsOf(
      buildEnabledChannelSources({ ...NOTHING_CHOSEN, channelEnabledById: { sspai: false } }),
    );
    expect(ids).not.toContain("sspai");
    expect(ids).toContain("juejin");
  });

  it("brings back a channel the catalog ships switched off once the reader switches it on", () => {
    const before = idsOf(buildEnabledChannelSources(NOTHING_CHOSEN));
    const offByDefault = listCatalogChannelChoices().find(
      (choice) => !choice.defaultEnabled && !choice.needsUserInput,
    );
    if (offByDefault === undefined) return; // every shipped channel is on by default today
    const ids = idsOf(
      buildEnabledChannelSources({
        ...NOTHING_CHOSEN,
        channelEnabledById: { [offByDefault.id]: true },
      }),
    );
    expect(before).not.toContain(offByDefault.id);
    expect(ids).toContain(offByDefault.id);
  });

  it("puts the 豆瓣 id into the address and only then polls it", () => {
    const sources = buildEnabledChannelSources({ ...NOTHING_CHOSEN, doubanUserId: "  leo42 " });
    const douban = sources.find((source) => source.id === "douban-interests");
    expect(douban?.endpoint.feedUrl).toContain("leo42");
    expect(douban?.endpoint.feedUrl).not.toContain("{userId}");
    expect(douban?.templateParameters).toBeUndefined();
  });

  it("keeps 豆瓣 out when the reader switched it off despite having typed an id", () => {
    const ids = idsOf(
      buildEnabledChannelSources({
        ...NOTHING_CHOSEN,
        doubanUserId: "leo42",
        channelEnabledById: { "douban-interests": false },
      }),
    );
    expect(ids).not.toContain("douban-interests");
  });

  it("adds a pasted feed as an ordinary feed source, named after its site", () => {
    const url = "https://example.org/blog/feed.xml";
    const added = buildEnabledChannelSources({ ...NOTHING_CHOSEN, userFeedUrls: [url] }).find(
      (source) => source.id === userFeedSourceId(url),
    );
    expect(added).toMatchObject({
      adapterType: "generic-feed",
      displayName: "example.org",
      endpoint: { feedUrl: url },
    });
  });

  it("skips a stored line that is not a usable address, keeping the good ones", () => {
    const good = "https://example.org/feed";
    const ids = idsOf(
      buildEnabledChannelSources({
        ...NOTHING_CHOSEN,
        userFeedUrls: ["not a url", good, good],
      }),
    );
    expect(ids.filter((id) => id.startsWith("user-feed:"))).toEqual([userFeedSourceId(good)]);
  });
});
