/**
 * Purpose: tests for the bilibili ranking adapter against envelopes shaped like the live ones —
 * that a cover served over plain http comes out over TLS, that a video opens at the address the
 * in-app player understands, and that risk control (`code: -352`, no `data` at all) reads as a
 * failed poll rather than as a source that has gone quiet.
 */
import { describe, expect, it } from "vitest";
import {
  bilibiliRankingUrls,
  fetchBilibiliRankingSource,
  parseBilibiliRanking,
  toHttpsImageUrl,
} from "./bilibiliRankingAdapter";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";
import { saturationCounts } from "./upstreamSignal";

const observedAt = new Date("2026-08-18T12:00:00.000Z");

const feedUrl = bilibiliRankingUrls.knowledge;

const source = fakeChannelSource({
  id: "bilibili-knowledge",
  adapterType: "bilibili-ranking",
  endpoint: { feedUrl },
  defaultKind: "video",
  language: "zh-CN",
});

/** Field-for-field the shape the live ranking answers with, trimmed to what the adapter reads. */
const rankingBody = JSON.stringify({
  code: 0,
  message: "OK",
  ttl: 1,
  data: {
    note: "根据稿件内容质量、近期的数据综合展示，动态更新",
    list: [
      {
        aid: 114256531955521,
        bvid: "BV1MN4y177PB",
        title: "回村三天，二舅治好了我的精神内耗",
        pic: "http://i2.hdslb.com/bfs/archive/349d11af2161fd4d734540df5206c66242.jpg",
        desc: "",
        dynamic: "谨以此片献给我的二舅",
        pubdate: 1_658_707_200,
        duration: 673,
        owner: { mid: 170948267, name: "衣戈猜想" },
        stat: { view: 2_000_000, danmaku: 314747, reply: 67921, like: 6386910 },
      },
      {
        aid: 114260625593646,
        bvid: "BV1Ab421e7yg",
        title: "数学之美",
        pic: "//i1.hdslb.com/bfs/archive/f5bdcfe57f253d121290c923de043697f262e3ae.jpg",
        desc: "一节课讲明白傅里叶变换",
        pubdate: 1_755_000_000,
        owner: { mid: 1, name: "李永乐老师" },
        stat: { view: 0 },
      },
      { title: "no bvid, so no address to open", pic: "http://example.com/a.jpg" },
    ],
  },
});

/** What risk control actually returns: 200, code -352, and no `data` key whatsoever. */
const riskControlBody = JSON.stringify({ code: -352, message: "-352", ttl: 1 });

describe("toHttpsImageUrl", () => {
  it("lifts plain http and protocol-relative covers to TLS and refuses anything else", () => {
    expect(toHttpsImageUrl("http://i0.hdslb.com/a.jpg")).toBe("https://i0.hdslb.com/a.jpg");
    expect(toHttpsImageUrl("//i0.hdslb.com/a.jpg")).toBe("https://i0.hdslb.com/a.jpg");
    expect(toHttpsImageUrl("https://i0.hdslb.com/a.jpg")).toBe("https://i0.hdslb.com/a.jpg");
    expect(toHttpsImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(toHttpsImageUrl("  ")).toBeNull();
    expect(toHttpsImageUrl(null)).toBeNull();
  });
});

describe("parseBilibiliRanking", () => {
  it("maps a ranking item onto the candidate contract", () => {
    const parsed = parseBilibiliRanking("bilibili-knowledge", rankingBody, observedAt);
    const [first, second] = parsed.items;

    expect(parsed.parseError).toBeNull();
    expect(parsed.responseCode).toBe(0);
    expect(parsed.items).toHaveLength(2);
    expect(first?.id).toBe("bilibili-knowledge:BV1MN4y177PB");
    expect(first?.kind).toBe("video");
    expect(first?.url).toBe("https://www.bilibili.com/video/BV1MN4y177PB");
    expect(first?.coverUrl).toBe(
      "https://i2.hdslb.com/bfs/archive/349d11af2161fd4d734540df5206c66242.jpg",
    );
    expect(first?.author).toBe("衣戈猜想");
    expect(first?.publishedAt).toBe("2022-07-25T00:00:00.000Z");
    // An empty desc falls through to the UP's own note rather than leaving the card blank.
    expect(first?.summary).toBe("谨以此片献给我的二舅");
    expect(second?.coverUrl).toBe(
      "https://i1.hdslb.com/bfs/archive/f5bdcfe57f253d121290c923de043697f262e3ae.jpg",
    );
  });

  it("normalizes play counts onto the log curve the other channels use", () => {
    const parsed = parseBilibiliRanking("bilibili-knowledge", rankingBody, observedAt);
    // Two million is the saturation count, so the first item is at the top of the scale.
    expect(saturationCounts.bilibiliViews).toBe(2_000_000);
    expect(parsed.items[0]?.upstreamSignal).toBe(1);
    expect(parsed.items[1]?.upstreamSignal).toBe(0);
  });

  it("counts an entry with no bvid as skipped rather than dropping the whole list", () => {
    const parsed = parseBilibiliRanking("bilibili-knowledge", rankingBody, observedAt);
    expect(parsed.skippedEntryCount).toBe(1);
  });

  it("reports risk control as a response code and never as items", () => {
    const parsed = parseBilibiliRanking("bilibili-knowledge", riskControlBody, observedAt);
    expect(parsed.responseCode).toBe(-352);
    expect(parsed.items).toEqual([]);
    expect(parsed.parseError).toBeNull();
  });

  it("reports a body that is not JSON, and one that is not an envelope, as a parse error", () => {
    expect(parseBilibiliRanking("s", "<html>nope</html>").parseError).not.toBeNull();
    expect(parseBilibiliRanking("s", JSON.stringify({ hello: "world" })).parseError).toBe(
      "bilibili response is not a list envelope",
    );
  });
});

describe("fetchBilibiliRankingSource", () => {
  it("asks the ranking address for JSON as the source's own poll", async () => {
    const { context, requests } = fakeFetchContext({ [feedUrl]: rankingBody });
    const result = await fetchBilibiliRankingSource(source, context, observedAt);

    expect(requests[0]?.url).toBe(feedUrl);
    expect(requests[0]?.kind).toBe("poll");
    expect(requests[0]?.accept).toContain("application/json");
    expect(result.outcome.status).toBe("fetched");
    expect(result.items).toHaveLength(2);
  });

  it("turns risk control into a failed poll, so the source falls into backoff", async () => {
    const { context } = fakeFetchContext({ [feedUrl]: riskControlBody });
    const result = await fetchBilibiliRankingSource(source, context, observedAt);

    expect(result.outcome).toEqual({
      status: "failed",
      reason: "bilibili refused the request (code -352)",
      httpStatus: 200,
    });
    expect(result.items).toEqual([]);
    expect(result.parseError).toBeNull();
  });

  it("stays quiet when the address is unreachable", async () => {
    const result = await fetchBilibiliRankingSource(source, fakeFetchContext({}).context);
    expect(result.outcome.status).toBe("failed");
    expect(result.items).toEqual([]);
  });
});
