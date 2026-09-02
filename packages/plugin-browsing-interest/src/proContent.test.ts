/**
 * Purpose: the professional-content cards read fields the service fills in opportunistically
 * (no id, no cover, no duration). These check that each missing field degrades on its own
 * instead of producing a broken link, a broken image, or a made-up percentage.
 */
import { describe, expect, it } from "vitest";
import { groupCounts, thumbnailUrl, videoUrl, watchedMinutes, watchedPercent } from "./proContent";
import type { ProContentItem } from "./schemas";

function item(overrides: Partial<ProContentItem> = {}): ProContentItem {
  return {
    ts: 1_756_000_000,
    id: "BV1xx411c7mD",
    title: "编译器是怎么工作的",
    up: "某个 UP",
    topic: "编程与软件开发",
    group: "科技数码",
    pic: "https://i0.hdslb.com/bfs/archive/abc.jpg",
    dwell: 300,
    dur: 600,
    site: "bilibili",
    ...overrides,
  };
}

describe("professional content derivations", () => {
  it("links each site by what the id tells us, and refuses to guess", () => {
    expect(videoUrl("bilibili", "BV1xx411c7mD")).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD",
    );
    expect(videoUrl("youtube", "dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    // A bilibili id stays a bilibili link even if the event was tagged with another site.
    expect(videoUrl("youtube", "BV1xx411c7mD")).toBe("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(videoUrl("bilibili", "")).toBeNull();
    expect(videoUrl("somewhere-new", "abc")).toBeNull();
  });

  it("only asks bilibili for a resized cover", () => {
    expect(thumbnailUrl("https://i0.hdslb.com/bfs/archive/abc.jpg")).toBe(
      "https://i0.hdslb.com/bfs/archive/abc.jpg@256w_160h_1c",
    );
    expect(thumbnailUrl("https://i.ytimg.com/vi/abc/hq.jpg")).toBe(
      "https://i.ytimg.com/vi/abc/hq.jpg",
    );
    expect(thumbnailUrl("")).toBeNull();
  });

  it("refuses any cover that is not a parseable http(s) url", () => {
    expect(thumbnailUrl("javascript:alert(1)")).toBeNull();
    expect(thumbnailUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(thumbnailUrl("file:///etc/passwd")).toBeNull();
    expect(thumbnailUrl("i0.hdslb.com/bfs/abc.jpg")).toBeNull();
    expect(thumbnailUrl("http://i0.hdslb.com/bfs/abc.jpg")).toBe(
      "http://i0.hdslb.com/bfs/abc.jpg@256w_160h_1c",
    );
  });

  it("matches the bilibili cdn on the host, not anywhere in the string", () => {
    expect(thumbnailUrl("https://evil.example/x?q=hdslb.com")).toBe(
      "https://evil.example/x?q=hdslb.com",
    );
    expect(thumbnailUrl("https://nothdslb.com/x.jpg")).toBe("https://nothdslb.com/x.jpg");
  });

  it("says nothing about progress when the page never gave a length", () => {
    expect(watchedPercent(item())).toBe(50);
    expect(watchedPercent(item({ dwell: 900 }))).toBe(100);
    expect(watchedPercent(item({ dur: 0 }))).toBeNull();
    expect(watchedMinutes(item())).toEqual({ watched: 5, total: 10 });
    expect(watchedMinutes(item({ dur: 0, dwell: 1200 }))).toBeNull();
  });

  it("counts the groups present, most-seen first, ignoring unclassified items", () => {
    expect(
      groupCounts([
        item({ group: "知识学习" }),
        item({ group: "科技数码" }),
        item({ group: "知识学习" }),
        item({ group: "" }),
      ]),
    ).toEqual([
      { group: "知识学习", count: 2 },
      { group: "科技数码", count: 1 },
    ]);
    expect(groupCounts([])).toEqual([]);
  });
});
