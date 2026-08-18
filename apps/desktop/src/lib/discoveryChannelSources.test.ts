/**
 * Purpose: unit tests for turning the reader's source settings into a polling list — the catalog
 * default when they never touched a switch, a switched-off channel staying home, the 豆瓣 entry
 * waiting for an id and then joining with the id in its address, pasted feeds becoming ordinary
 * generic-feed sources, and a broken pasted line costing nothing but itself — plus the language
 * gate (spec 054): channels publishing in a language the reader did not choose stay home, the
 * ones with no language of their own and the ones publishing papers always come, and a channel
 * the reader switched on by hand comes whatever it publishes in.
 */
import { loadStarterChannelCatalog } from "@breadcrumb/plugin-channels";
import { describe, expect, it } from "vitest";
import {
  buildEnabledChannelSources,
  type ChannelSourceSelection,
  listCatalogChannelChoices,
  userFeedSourceId,
} from "./discoveryChannelSources";

const NOTHING_CHOSEN: ChannelSourceSelection = {
  channelEnabledById: {},
  userFeedUrls: [],
  doubanUserId: "",
  feedLanguage: "zh",
  additionalFeedLanguages: [],
};

/** Both catalog languages on, so a test about switches is not accidentally a test about
 * language as well. */
const BOTH_LANGUAGES: ChannelSourceSelection = {
  ...NOTHING_CHOSEN,
  additionalFeedLanguages: ["en"],
};

function idsOf(sources: readonly { id: string }[]): string[] {
  return sources.map((source) => source.id);
}

describe("buildEnabledChannelSources", () => {
  it("follows the catalog's own defaults when the reader has changed nothing", () => {
    const ids = idsOf(buildEnabledChannelSources(BOTH_LANGUAGES));
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
    const before = idsOf(buildEnabledChannelSources(BOTH_LANGUAGES));
    const offByDefault = listCatalogChannelChoices().find(
      (choice) => !choice.defaultEnabled && !choice.needsUserInput,
    );
    if (offByDefault === undefined) return; // every shipped channel is on by default today
    const ids = idsOf(
      buildEnabledChannelSources({
        ...BOTH_LANGUAGES,
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

/** Read off the shipped catalog rather than hard-coded, so these stay true as it grows. Papers
 * are left out because they are exempt from the language gate and would pass either way. */
function catalogIdsWithLanguage(language: string): string[] {
  return loadStarterChannelCatalog()
    .sources.filter(
      (source) =>
        source.language === language && source.defaultEnabled && source.defaultKind !== "paper",
    )
    .map((source) => source.id);
}

describe("the language the reader chose", () => {
  it("polls the chosen language and leaves the other one home", () => {
    const ids = idsOf(buildEnabledChannelSources(NOTHING_CHOSEN));
    for (const id of catalogIdsWithLanguage("zh")) expect(ids).toContain(id);
    // arXiv is the exception below; everything else in English stays home.
    expect(ids).not.toContain("quanta-magazine");
    expect(ids).not.toContain("hacker-news-front-page");
  });

  it("polls the other language too once it is switched on in the language settings", () => {
    const ids = idsOf(buildEnabledChannelSources(BOTH_LANGUAGES));
    for (const id of catalogIdsWithLanguage("en")) expect(ids).toContain(id);
  });

  it("keeps polling papers whatever the language, because academic content is exempt", () => {
    const ids = idsOf(buildEnabledChannelSources(NOTHING_CHOSEN));
    expect(ids).toContain("arxiv-cs-ai");
    expect(ids).toContain("arxiv-q-bio-nc");
  });

  it("stops polling papers when academic content is switched off", () => {
    // The follow-up task's switch sets academicContentEnabled; this is what it will do.
    const ids = idsOf(
      buildEnabledChannelSources({ ...NOTHING_CHOSEN, academicContentEnabled: false }),
    );
    expect(ids).not.toContain("arxiv-cs-ai");
  });

  it("serves a channel with no language of its own, whichever language is chosen", () => {
    const url = "https://example.org/feed";
    const ids = idsOf(buildEnabledChannelSources({ ...NOTHING_CHOSEN, userFeedUrls: [url] }));
    expect(ids).toContain(userFeedSourceId(url));
    expect(ids).toContain("podcast-search");
  });

  it("keeps a channel the reader switched on by hand, whatever it publishes in", () => {
    const ids = idsOf(
      buildEnabledChannelSources({
        ...NOTHING_CHOSEN,
        channelEnabledById: { "quanta-magazine": true },
      }),
    );
    expect(ids).toContain("quanta-magazine");
  });
});
