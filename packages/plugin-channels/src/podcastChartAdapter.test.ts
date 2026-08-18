/**
 * Purpose: tests for the Apple podcast pipeline — chart, lookup, show feed — against payloads
 * shaped like the live ones. What matters here is that no hand-written list of shows is involved,
 * that every episode ends up with a cover even when its own feed publishes none, and that the poll
 * reads a different slice of the chart each time rather than the same three shows forever.
 */
import { describe, expect, it } from "vitest";
import { fetchPodcastChartSource, podcastChartShowWindow } from "./podcastChartAdapter";
import {
  buildItunesLookupUrl,
  buildPodcastChartUrl,
  itunesChartGenres,
  parsePodcastChartEntries,
  upgradeItunesArtwork,
} from "./podcastChartDirectory";
import { RequestRateWindow } from "./requestRateWindow";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";

const observedAt = new Date("2026-08-18T12:00:00.000Z");
const pollInterval = 6 * 60 * 60 * 1000;

/** A fresh window per test, so one test's two iTunes calls do not use up another's room. The real
 * budget is the same; two calls a poll never comes close to it. */
function freshRateWindow(): RequestRateWindow {
  return new RequestRateWindow({ maximumRequests: 20, windowMilliseconds: 60_000 });
}

const chartUrl = buildPodcastChartUrl("cn", itunesChartGenres.education);

function chartEntry(id: string, name: string): unknown {
  return {
    "im:name": { label: name },
    "im:artist": { label: `${name} 制作组` },
    "im:image": [
      { label: `https://is1-ssl.mzstatic.com/image/thumb/${id}.jpg/55x55bb.png` },
      { label: `https://is1-ssl.mzstatic.com/image/thumb/${id}.jpg/170x170bb.png` },
    ],
    id: {
      label: `https://podcasts.apple.com/cn/podcast/id${id}?uo=2`,
      attributes: { "im:id": id },
    },
    link: { attributes: { href: `https://podcasts.apple.com/cn/podcast/id${id}?uo=2` } },
  };
}

const chartBody = JSON.stringify({
  feed: {
    entry: [
      chartEntry("751574016", "纵横四海"),
      chartEntry("262026947", "6 Minute English"),
      chartEntry("1715590582", "钱婧老师的会客厅"),
      chartEntry("520986449", "开言英语"),
      // No id at all: unreachable, so it must not consume a slot in the window.
      { "im:name": { label: "无 id 的节目" } },
    ],
  },
});

/** Only the two fields the pipeline reads; the live payload carries several dozen more. */
function lookupBody(entries: ReadonlyArray<[number, string]>): string {
  return JSON.stringify({
    resultCount: entries.length,
    results: entries.map(([collectionId, feedUrl]) => ({
      wrapperType: "track",
      collectionId,
      collectionName: `show ${collectionId}`,
      feedUrl,
    })),
  });
}

const showFeedUrl = "https://feed.xyzfm.space/9lgcqvwrheuj";

const showFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>钱婧老师的会客厅</title>
  <link>https://www.xiaoyuzhoufm.com/podcast/1</link>
  <item>
    <title>怎样和导师沟通</title>
    <link>https://www.xiaoyuzhoufm.com/episode/older</link>
    <guid>episode-older</guid>
    <pubDate>Sun, 10 Aug 2026 09:00:00 GMT</pubDate>
    <description>读研第一年该问什么。</description>
    <enclosure url="https://media.xyzfm.space/older.m4a" length="1" type="audio/mp4"/>
  </item>
  <item>
    <title>面试那天早上</title>
    <link>https://www.xiaoyuzhoufm.com/episode/newer</link>
    <guid>episode-newer</guid>
    <pubDate>Sun, 17 Aug 2026 09:00:00 GMT</pubDate>
    <description>不用把紧张当成敌人。</description>
    <enclosure url="https://media.xyzfm.space/newer.m4a" length="1" type="audio/mp4"/>
  </item>
</channel></rss>`;

const source = fakeChannelSource({
  id: "podcast-chart-education",
  adapterType: "podcast-charts",
  endpoint: { feedUrl: chartUrl, showFeedsPerPoll: 1 },
  defaultKind: "podcast",
  language: "zh-CN",
  fetchPolicy: {
    minimumIntervalMilliseconds: pollInterval,
    dailyRequestBudget: 24,
    userAgentOverride: null,
  },
});

describe("buildPodcastChartUrl", () => {
  it("builds the category chart address the survey verified", () => {
    expect(chartUrl).toBe("https://itunes.apple.com/cn/rss/toppodcasts/limit=50/genre=1304/json");
    expect(itunesChartGenres).toEqual({ education: 1304, history: 1487, science: 1533 });
  });
});

describe("upgradeItunesArtwork", () => {
  it("asks for the card-sized rendering of the artwork the chart lists", () => {
    expect(upgradeItunesArtwork("https://is1-ssl.mzstatic.com/a.jpg/170x170bb.png")).toBe(
      "https://is1-ssl.mzstatic.com/a.jpg/600x600bb.png",
    );
    expect(upgradeItunesArtwork("https://example.com/plain.png")).toBe(
      "https://example.com/plain.png",
    );
    expect(upgradeItunesArtwork(null)).toBeNull();
  });
});

describe("parsePodcastChartEntries", () => {
  it("reads name, id and the largest artwork, and drops a show with no id", () => {
    const entries = parsePodcastChartEntries(chartBody);
    expect(entries).toHaveLength(4);
    expect(entries[0]?.collectionId).toBe("751574016");
    expect(entries[0]?.showName).toBe("纵横四海");
    expect(entries[0]?.artworkUrl).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/751574016.jpg/600x600bb.png",
    );
    expect(entries[0]?.storeUrl).toBe("https://podcasts.apple.com/cn/podcast/id751574016?uo=2");
  });

  it("returns nothing for a body that is not a chart", () => {
    expect(parsePodcastChartEntries("<html>")).toEqual([]);
    expect(parsePodcastChartEntries(JSON.stringify({ feed: {} }))).toEqual([]);
  });
});

describe("buildItunesLookupUrl", () => {
  it("asks for every id in one call, as the documented API takes them", () => {
    expect(buildItunesLookupUrl(["1", "2"])).toBe(
      "https://itunes.apple.com/lookup?id=1%2C2&entity=podcast",
    );
  });
});

describe("podcastChartShowWindow", () => {
  const entries = parsePodcastChartEntries(chartBody);

  it("moves on by one window per poll interval, so the chart comes round", () => {
    const first = podcastChartShowWindow(entries, 2, pollInterval, observedAt);
    const next = podcastChartShowWindow(
      entries,
      2,
      pollInterval,
      new Date(observedAt.getTime() + pollInterval),
    );
    expect(first.map((show) => show.showName)).not.toEqual(next.map((show) => show.showName));
    expect(first).toHaveLength(2);
    expect(next).toHaveLength(2);
  });

  it("wraps around the end of the chart rather than running short", () => {
    const window = podcastChartShowWindow(entries, 3, pollInterval, observedAt);
    expect(window).toHaveLength(3);
    expect(new Set(window.map((show) => show.collectionId)).size).toBe(3);
  });

  it("asks for nothing when the chart is empty or the window is zero", () => {
    expect(podcastChartShowWindow([], 3, pollInterval, observedAt)).toEqual([]);
    expect(podcastChartShowWindow(entries, 0, pollInterval, observedAt)).toEqual([]);
  });
});

describe("fetchPodcastChartSource", () => {
  function contextForOneShow(): ReturnType<typeof fakeFetchContext> {
    const window = podcastChartShowWindow(
      parsePodcastChartEntries(chartBody),
      1,
      pollInterval,
      observedAt,
    );
    const chosen = window[0];
    if (chosen === undefined) throw new Error("window should not be empty");
    return fakeFetchContext({
      [chartUrl]: chartBody,
      [buildItunesLookupUrl([chosen.collectionId])]: lookupBody([
        [Number(chosen.collectionId), showFeedUrl],
      ]),
      [showFeedUrl]: showFeed,
    });
  }

  it("walks chart, lookup and the show's own feed, and comes back with episodes", async () => {
    const { context, requests } = contextForOneShow();
    const result = await fetchPodcastChartSource(source, context, {
      observedAt,
      rateWindow: freshRateWindow(),
    });

    expect(requests.map((request) => request.kind)).toEqual(["poll", "follow-up", "follow-up"]);
    expect(requests[0]?.url).toBe(chartUrl);
    expect(requests[1]?.url).toContain("itunes.apple.com/lookup");
    expect(requests[2]?.url).toBe(showFeedUrl);
    expect(result.followUpRequestCount).toBe(2);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.kind).toBe("podcast");
    // Newest first, so a weekly show is not buried by a daily one.
    expect(result.items[0]?.title).toBe("面试那天早上");
    expect(result.items[0]?.mediaUrl).toBe("https://media.xyzfm.space/newer.m4a");
  });

  it("falls back to the chart's artwork for an episode that publishes none", async () => {
    const { context } = contextForOneShow();
    const result = await fetchPodcastChartSource(source, context, {
      observedAt,
      rateWindow: freshRateWindow(),
    });
    for (const item of result.items) {
      expect(item.coverUrl).toMatch(/^https:\/\/is1-ssl\.mzstatic\.com\//);
    }
  });

  it("reports a chart with no shows as a parse error rather than as an empty success", async () => {
    const { context } = fakeFetchContext({ [chartUrl]: JSON.stringify({ feed: {} }) });
    const result = await fetchPodcastChartSource(source, context, {
      observedAt,
      rateWindow: freshRateWindow(),
    });
    expect(result.parseError).toBe("iTunes chart carried no shows");
    expect(result.items).toEqual([]);
  });

  it("gives up quietly when the lookup answers nothing, without opening any feed", async () => {
    const { context, requests } = fakeFetchContext({ [chartUrl]: chartBody });
    const result = await fetchPodcastChartSource(source, context, {
      observedAt,
      rateWindow: freshRateWindow(),
    });
    expect(result.items).toEqual([]);
    expect(result.parseError).toBeNull();
    expect(requests).toHaveLength(2);
  });

  it("stays quiet when the chart itself is unreachable", async () => {
    const result = await fetchPodcastChartSource(source, fakeFetchContext({}).context, {
      observedAt,
      rateWindow: freshRateWindow(),
    });
    expect(result.outcome.status).toBe("failed");
    expect(result.items).toEqual([]);
  });

  /**
   * The shared iTunes ceiling turns a poll away; it never delays one. A version that waited for
   * room put fifteen seconds into every restock with three charts due and made the 30-day
   * simulation exceed its whole three-minute budget.
   */
  it("makes no request at all when the shared iTunes window is full", async () => {
    const full = new RequestRateWindow({ maximumRequests: 1, windowMilliseconds: 60_000 });
    expect(full.tryAcquire()).toBe(true);
    const { context, requests } = fakeFetchContext({ [chartUrl]: chartBody });
    const result = await fetchPodcastChartSource(source, context, { observedAt, rateWindow: full });

    expect(result.outcome).toEqual({ status: "skipped", reason: "service-rate-limit" });
    expect(requests).toEqual([]);
    expect(result.items).toEqual([]);
  });

  it("reads the chart but skips the lookup when only one call's room is left", async () => {
    const nearlyFull = new RequestRateWindow({ maximumRequests: 1, windowMilliseconds: 60_000 });
    const { context, requests } = fakeFetchContext({ [chartUrl]: chartBody });
    const result = await fetchPodcastChartSource(source, context, {
      observedAt,
      rateWindow: nearlyFull,
    });

    expect(requests.map((request) => request.url)).toEqual([chartUrl]);
    expect(result.followUpRequestCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.parseError).toBeNull();
  });
});
