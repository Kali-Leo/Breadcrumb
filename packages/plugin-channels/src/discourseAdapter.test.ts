/**
 * Purpose: tests for the Discourse adapter against a linux.do-shaped `/latest.rss` and a
 * `/t/{id}.json` topic payload — that discovery produces discussions, that the full post body and
 * the reply count replace the RSS excerpt for the newest few topics only, and that a topic which
 * refuses to load leaves its card standing instead of taking it down.
 */
import { describe, expect, it } from "vitest";
import { fetchDiscourseSource } from "./discourseAdapter";
import { extractDiscourseTopicId } from "./discourseTopic";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const latestRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>linux.do 最新话题</title>
    <link>https://linux.do/latest</link>
    <description>最新话题</description>
    <item>
      <title>请教一个 systemd 的问题</title>
      <dc:creator><![CDATA[wei]]></dc:creator>
      <link>https://linux.do/t/topic/70001</link>
      <guid isPermaLink="false">https://linux.do/t/topic/70001</guid>
      <pubDate>Sun, 17 Aug 2026 03:00:00 +0000</pubDate>
      <description>&lt;p&gt;RSS 里只有摘要&lt;/p&gt;</description>
    </item>
    <item>
      <title>周末闲聊</title>
      <dc:creator><![CDATA[lin]]></dc:creator>
      <link>https://linux.do/t/topic/70002/3</link>
      <guid isPermaLink="false">https://linux.do/t/topic/70002</guid>
      <pubDate>Sun, 17 Aug 2026 02:00:00 +0000</pubDate>
      <description>另一条摘要</description>
    </item>
  </channel>
</rss>`;

const topicJson = JSON.stringify({
  id: 70001,
  title: "请教一个 systemd 的问题",
  slug: "topic",
  created_at: "2026-08-17T03:00:00.000Z",
  posts_count: 25,
  image_url: "/uploads/cover.png",
  post_stream: {
    posts: [
      {
        cooked: "<p>完整正文第一段。</p><p>第二段。</p>",
        username: "wei",
        name: "Wei",
        created_at: "2026-08-17T03:00:00.000Z",
      },
    ],
  },
});

const source = fakeChannelSource({
  id: "linux-do",
  adapterType: "discourse",
  endpoint: { feedUrl: "https://linux.do/latest.rss", fullTextTopicsPerPoll: 1 },
  defaultKind: "discussion",
});

describe("fetchDiscourseSource", () => {
  it("discovers topics from RSS and opens only the newest ones the catalog allows", async () => {
    const { context, requests } = fakeFetchContext({
      "https://linux.do/latest.rss": latestRss,
      "https://linux.do/t/70001.json": topicJson,
    });
    const result = await fetchDiscourseSource(source, context, observedAt);

    expect(requests.map((request) => request.url)).toEqual([
      "https://linux.do/latest.rss",
      "https://linux.do/t/70001.json",
    ]);
    expect(requests[0]?.kind).toBe("poll");
    expect(requests[1]?.kind).toBe("follow-up");
    expect(result.followUpRequestCount).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.kind === "discussion")).toBe(true);
  });

  it("replaces the excerpt with the whole first post and reads replies as a crowd signal", async () => {
    const { context } = fakeFetchContext({
      "https://linux.do/latest.rss": latestRss,
      "https://linux.do/t/70001.json": topicJson,
    });
    const [first, second] = (await fetchDiscourseSource(source, context, observedAt)).items;

    expect(first?.summary).toBe("完整正文第一段。 第二段。");
    expect(first?.author).toBe("Wei");
    expect(first?.coverUrl).toBe("https://linux.do/uploads/cover.png");
    expect(first?.upstreamSignal).toBeCloseTo(
      normalizeCountToSignal(24, saturationCounts.discourseReplies),
      10,
    );
    expect(second?.summary).toBe("另一条摘要");
    expect(second?.upstreamSignal).toBeNull();
  });

  it("keeps the RSS-derived card when the topic body cannot be loaded", async () => {
    const { context } = fakeFetchContext({ "https://linux.do/latest.rss": latestRss });
    const result = await fetchDiscourseSource(source, context, observedAt);
    expect(result.items[0]?.summary).toBe("RSS 里只有摘要");
    expect(result.parseError).toBeNull();
  });

  it("reports the poll outcome and no items when the forum itself is unreachable", async () => {
    const { context } = fakeFetchContext({});
    const result = await fetchDiscourseSource(source, context, observedAt);
    expect(result.outcome.status).toBe("failed");
    expect(result.items).toEqual([]);
  });
});

describe("extractDiscourseTopicId", () => {
  it("reads the id from both address shapes and from a post-numbered link", () => {
    expect(extractDiscourseTopicId("https://linux.do/t/some-slug/70001")).toBe(70001);
    expect(extractDiscourseTopicId("https://linux.do/t/70001")).toBe(70001);
    expect(extractDiscourseTopicId("https://linux.do/t/some-slug/70001/12")).toBe(70001);
  });

  it("returns null for an address that is not a topic", () => {
    expect(extractDiscourseTopicId("https://linux.do/categories")).toBeNull();
    expect(extractDiscourseTopicId("not a url")).toBeNull();
  });
});
