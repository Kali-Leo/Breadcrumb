/**
 * Purpose: tests for the V2EX adapter against a hot-topics payload shaped like the live API's —
 * that the opening post arrives with the list, that replies become the crowd signal, that a member
 * avatar is not passed off as a cover image, and that a response which is not a topic list at all
 * degrades to a parse error instead of a throw.
 */
import { describe, expect, it } from "vitest";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";
import { fetchV2exSource, parseV2exTopics } from "./v2exAdapter";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

const hotTopics = JSON.stringify([
  {
    id: 1234854,
    title: "问一个 SQLite 的问题",
    url: "https://www.v2ex.com/t/1234854",
    content: "**加粗** 的正文\r\n\r\n第二段",
    content_rendered: "<p>渲染过的正文</p>",
    replies: 244,
    created: 1786929608,
    member: { id: 621675, username: "xiaofangcode", avatar_normal: "//cdn.v2ex.com/a.png" },
    node: { name: "qna", title: "问与答" },
  },
  {
    id: 1234855,
    title: "没有正文的主题",
    replies: 0,
    created: 1786929000,
  },
  { id: "not-a-number", title: "结构不对的主题" },
]);

const source = fakeChannelSource({
  id: "v2ex-hot",
  adapterType: "v2ex",
  endpoint: { feedUrl: "https://www.v2ex.com/api/topics/hot.json" },
  defaultKind: "discussion",
});

describe("parseV2exTopics", () => {
  const result = parseV2exTopics(source.id, hotTopics, observedAt);

  it("keeps the well-formed topics and counts the broken one", () => {
    expect(result.items.map((item) => item.id)).toEqual(["v2ex-hot:1234854", "v2ex-hot:1234855"]);
    expect(result.skippedEntryCount).toBe(1);
    expect(result.parseError).toBeNull();
  });

  it("uses the topic body that came with the list and the unix timestamp", () => {
    expect(result.items[0]?.summary).toBe("**加粗** 的正文 第二段");
    expect(result.items[0]?.author).toBe("xiaofangcode");
    expect(result.items[0]?.kind).toBe("discussion");
    expect(result.items[0]?.publishedAt).toBe(new Date(1786929608 * 1000).toISOString());
  });

  it("reads replies as the crowd signal", () => {
    expect(result.items[0]?.upstreamSignal).toBeCloseTo(
      normalizeCountToSignal(244, saturationCounts.v2exReplies),
      10,
    );
    expect(result.items[1]?.upstreamSignal).toBe(0);
  });

  it("leaves the cover empty rather than showing the poster's avatar", () => {
    expect(result.items[0]?.coverUrl).toBeNull();
  });

  it("falls back to the topic address when the payload omits the url", () => {
    expect(result.items[1]?.url).toBe("https://www.v2ex.com/t/1234855");
  });

  it("reports a parse error for a body that is not JSON, and for JSON that is not a list", () => {
    expect(parseV2exTopics(source.id, "<html>blocked</html>").parseError).not.toBeNull();
    expect(parseV2exTopics(source.id, '{"message":"nope"}').parseError).toBe(
      "v2ex response is not a topic list",
    );
  });
});

describe("fetchV2exSource", () => {
  it("polls the catalog address asking for JSON", async () => {
    const { context, requests } = fakeFetchContext({
      "https://www.v2ex.com/api/topics/hot.json": hotTopics,
    });
    const result = await fetchV2exSource(source, context, observedAt);
    expect(requests[0]?.kind).toBe("poll");
    expect(requests[0]?.accept).toContain("application/json");
    expect(result.items).toHaveLength(2);
  });

  it("comes back empty when the API is unreachable", async () => {
    const { context } = fakeFetchContext({});
    const result = await fetchV2exSource(source, context, observedAt);
    expect(result.items).toEqual([]);
    expect(result.outcome.status).toBe("failed");
  });
});
