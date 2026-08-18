/**
 * Purpose: the only tests here that touch the real network — one cheap call per adapter family, to
 * catch the kind of breakage no fixture can (an endpoint moved, a payload changed shape, a host
 * started refusing our User-Agent). Skipped unless RUN_LIVE_CHANNEL_TESTS=1, so the ordinary suite
 * stays offline and deterministic.
 *
 * Run with: RUN_LIVE_CHANNEL_TESTS=1 pnpm --filter @breadcrumb/plugin-channels test
 * Behind a proxy, add NODE_USE_ENV_PROXY=1 — Node's fetch ignores http_proxy without it.
 */
import { describe, expect, it } from "vitest";
import { type ChannelSource, loadStarterChannelCatalog } from "./channelCatalog";
import { ChannelFetcher } from "./channelFetcher";
import type { ConditionalRequestStore } from "./fetchContract";
import { searchPodcastShows } from "./podcastSearchAdapter";
import { fetchLatestFromSource } from "./sourceFetchFacade";
import { fakeChannelSource } from "./testDoubles";
import { buildYoutubeChannelFeedUrl, fetchYoutubeOEmbed } from "./youtubeChannelAdapter";

const live = process.env.RUN_LIVE_CHANNEL_TESTS === "1";
const timeoutMilliseconds = 45_000;

/** Nothing is persisted: every live call asks unconditionally and forgets. */
const forgetfulStore: ConditionalRequestStore = {
  read: async () => null,
  write: async () => undefined,
};

function fetcher(): ChannelFetcher {
  return new ChannelFetcher({
    fetchImplementation: (url, init) => fetch(url, init),
    conditionalRequestStore: forgetfulStore,
    requestTimeoutMilliseconds: 30_000,
  });
}

function starterSource(id: string): ChannelSource {
  const source = loadStarterChannelCatalog().sources.find((one) => one.id === id);
  if (!source) throw new Error(`missing starter source ${id}`);
  return source;
}

/** One topic body is enough to prove the follow-up path works; five would be rude. */
function withOneFullTextTopic(source: ChannelSource): ChannelSource {
  return { ...source, endpoint: { ...source.endpoint, fullTextTopicsPerPoll: 1 } };
}

describe.skipIf(!live)("live channel smoke", () => {
  /**
   * linux.do sits behind Cloudflare, which fingerprints the TLS handshake as well as the
   * User-Agent: the same address answers curl with 200 and Node's fetch with 403 from this
   * machine, whatever headers we send. The shipping app talks to it through Tauri's HTTP client,
   * not through Node, so a refusal here says nothing about the adapter — what this test can still
   * prove is that a refusal degrades quietly and that a success is read correctly.
   */
  it(
    "reads linux.do topics, including one full post body, when Cloudflare lets us in",
    async () => {
      const source = withOneFullTextTopic(starterSource("linux-do"));
      const channelFetcher = fetcher();
      const result = await fetchLatestFromSource(source, channelFetcher.contextForSource(source));

      if (result.outcome.status !== "fetched") {
        expect(result.items).toEqual([]);
        expect(result.parseError).toBeNull();
        return;
      }
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.kind).toBe("discussion");
      expect(result.followUpRequestCount).toBe(1);
    },
    timeoutMilliseconds,
  );

  /** The survey measured meta.discourse.org answering an ordinary client, so this is where the
   * follow-up path can actually be proven end to end. */
  it(
    "reads a Discourse forum and pulls one full topic body from it",
    async () => {
      const source = withOneFullTextTopic(
        fakeChannelSource({
          id: "meta-discourse",
          adapterType: "discourse",
          endpoint: { feedUrl: "https://meta.discourse.org/latest.rss" },
          defaultKind: "discussion",
        }),
      );
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));

      expect(result.outcome.status).toBe("fetched");
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.followUpRequestCount).toBe(1);
      expect(result.items[0]?.upstreamSignal).not.toBeNull();
      expect(result.items[0]?.summary.length).toBeGreaterThan(0);
    },
    timeoutMilliseconds,
  );

  it(
    "reads the V2EX hot list",
    async () => {
      const source = starterSource("v2ex-hot");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.kind).toBe("discussion");
    },
    timeoutMilliseconds,
  );

  it(
    "reads the Hacker News front page",
    async () => {
      const source = starterSource("hacker-news-front-page");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.upstreamSignal).not.toBeNull();
    },
    timeoutMilliseconds,
  );

  it(
    "reads an arXiv category feed with abstracts attached",
    async () => {
      const source = starterSource("arxiv-cs-ai");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.kind).toBe("paper");
      expect(result.items[0]?.summary.length).toBeGreaterThan(0);
    },
    timeoutMilliseconds,
  );

  it(
    "resolves a term to podcast feed addresses",
    async () => {
      const source = starterSource("podcast-search");
      const shows = await searchPodcastShows(
        "climate",
        source,
        fetcher().contextForSource(source),
        {
          limit: 3,
        },
      );
      expect(shows.length).toBeGreaterThan(0);
      expect(shows[0]?.feedUrl).toMatch(/^https?:\/\//);
    },
    timeoutMilliseconds,
  );

  /**
   * bilibili's risk control answers 200 with `code: -352` once one address has asked a few times
   * in a row, which the survey hit on 2026-08-18 and which the adapter reports as a failed poll.
   * That is a correct outcome, not a broken adapter, so the assertion splits on it.
   */
  it(
    "reads the bilibili knowledge ranking, or is turned away by risk control",
    async () => {
      const source = starterSource("bilibili-knowledge");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));

      if (result.outcome.status !== "fetched") {
        expect(result.items).toEqual([]);
        return;
      }
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.kind).toBe("video");
      expect(result.items[0]?.url).toMatch(/^https:\/\/www\.bilibili\.com\/video\/BV/);
      expect(result.items[0]?.coverUrl).toMatch(/^https:\/\//);
    },
    timeoutMilliseconds,
  );

  /** Three requests deep — chart, lookup, one show feed — which is the whole point of testing it
   * live: each step is a different host with a different way of going wrong. */
  it(
    "walks an Apple category chart through to a show's episodes",
    async () => {
      const source = starterSource("podcast-chart-education");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));

      expect(result.outcome.status).toBe("fetched");
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]?.kind).toBe("podcast");
      for (const item of result.items) expect(item.coverUrl).not.toBeNull();
    },
    // Chart, lookup and up to three podcast feeds, with iTunes' three-second gap between calls.
    timeoutMilliseconds * 2,
  );

  it(
    "reads Wikipedia's featured content for yesterday",
    async () => {
      const source = starterSource("wikipedia-zh-featured");
      const result = await fetchLatestFromSource(source, fetcher().contextForSource(source));

      expect(result.outcome.status).toBe("fetched");
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) expect(item.coverUrl).not.toBeNull();
    },
    timeoutMilliseconds,
  );

  it(
    "fills in a YouTube video's title and cover through oEmbed",
    async () => {
      const source = fakeChannelSource({
        id: "youtube-oembed",
        adapterType: "youtube-channel",
        endpoint: { feedUrl: buildYoutubeChannelFeedUrl("UCsample") },
        defaultKind: "video",
      });
      const preview = await fetchYoutubeOEmbed(
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        fetcher().contextForSource(source),
      );
      expect(preview?.title).toBe("Me at the zoo");
      expect(preview?.thumbnailUrl).toMatch(/^https?:\/\//);
    },
    timeoutMilliseconds,
  );
});
