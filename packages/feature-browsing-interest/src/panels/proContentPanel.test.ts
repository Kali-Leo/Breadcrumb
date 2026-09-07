import { describe, expect, it } from "vitest";
import type { BrowsingEventRow } from "../events";
import { groupOfTopic, PRO_TOPIC_INDICES, TOPIC_LEAVES } from "../taxonomy";
import { PRO_LIST_LIMIT, proContentPanel } from "./proContentPanel";

const DAY = 86400;
const NOW = 400 * DAY;
const PRO = [...PRO_TOPIC_INDICES][0] ?? 0;
const ENT = [...Array(48).keys()].find((index) => !PRO_TOPIC_INDICES.has(index)) ?? 47;

function row(overrides: Partial<BrowsingEventRow> = {}): BrowsingEventRow {
  return {
    ts: NOW,
    site: "bilibili",
    vid: "v1",
    title: "标题",
    up: "作者",
    etype: "watch",
    dwell: 0,
    dur: 0,
    topic: PRO,
    emo: null,
    valence: null,
    pic: "pic.jpg",
    classifier: "ngram",
    ...overrides,
  };
}

const options = { days: 90, now: NOW } as const;

describe("proContentPanel", () => {
  it("returns two empty lists for no events, still naming the window", () => {
    const result = proContentPanel([], options);
    expect(result).toEqual({ days: 90, finished: [], unfinished: [] });
  });

  it("calls a single watch of most of a video finished", () => {
    const result = proContentPanel([row({ dwell: 800, dur: 1000 })], options);
    expect(result.finished).toHaveLength(1);
    expect(result.finished[0]?.topic).toBe(TOPIC_LEAVES[PRO]);
    expect(result.finished[0]?.group).toBe(groupOfTopic(PRO));
    expect(result.finished[0]?.dwell).toBe(800);
  });

  it("calls a real but partial watch unfinished", () => {
    const result = proContentPanel([row({ dwell: 100, dur: 1000 })], options);
    expect(result.unfinished).toHaveLength(1);
    expect(result.finished).toEqual([]);
  });

  it("lists a barely-touched video nowhere rather than as unfinished", () => {
    const result = proContentPanel([row({ dwell: 5, dur: 1000 })], options);
    expect(result.finished).toEqual([]);
    expect(result.unfinished).toEqual([]);
  });

  it("accumulates dwell across the segments one video arrives in", () => {
    // Three sittings of five minutes each on a twenty-minute video: finished, not abandoned.
    const rows = [
      row({ ts: NOW, dwell: 300, dur: 1200 }),
      row({ ts: NOW - 3600, dwell: 300, dur: 1200 }),
      row({ ts: NOW - 7200, dwell: 420, dur: 1200 }),
    ];
    const result = proContentPanel(rows, options);
    expect(result.finished).toHaveLength(1);
    expect(result.finished[0]?.dwell).toBe(1020);
    // Reading only the newest event would have called this 300/1200 — unfinished.
  });

  it("takes the largest reported duration, and the newest row's metadata", () => {
    const rows = [
      row({ ts: NOW, dwell: 10, dur: 0, title: "最新标题" }),
      row({ ts: NOW - 60, dwell: 900, dur: 1000, title: "旧标题" }),
    ];
    const result = proContentPanel(rows, options);
    expect(result.finished[0]?.title).toBe("最新标题");
    expect(result.finished[0]?.dur).toBe(1000);
  });

  it("with no duration at all, counts ten minutes as watched and less as unknown", () => {
    expect(proContentPanel([row({ dwell: 700, dur: 0 })], options).finished).toHaveLength(1);
    const brief = proContentPanel([row({ dwell: 120, dur: 0 })], options);
    expect(brief.finished).toEqual([]);
    expect(brief.unfinished).toEqual([]);
  });

  it("only lists professional topics, and skips what nothing classified", () => {
    const rows = [
      row({ vid: "a", dwell: 900, dur: 1000, topic: PRO }),
      row({ vid: "b", dwell: 900, dur: 1000, topic: ENT }),
      row({ vid: "c", dwell: 900, dur: 1000, topic: null }),
    ];
    expect(proContentPanel(rows, options).finished.map((item) => item.id)).toEqual(["a"]);
  });

  it("ignores exposures — being shown a lecture is not watching one", () => {
    const rows = [row({ etype: "expose", dwell: 900, dur: 1000 })];
    expect(proContentPanel(rows, options).finished).toEqual([]);
  });

  it("ignores anything older than the window", () => {
    const rows = [row({ ts: NOW - 200 * DAY, dwell: 900, dur: 1000 })];
    expect(proContentPanel(rows, options).finished).toEqual([]);
  });

  it("groups by title when a video has no id, so two untitled sources do not merge", () => {
    const rows = [
      row({ vid: "", title: "讲座 A", dwell: 900, dur: 1000 }),
      row({ vid: "", title: "讲座 B", dwell: 900, dur: 1000 }),
    ];
    expect(proContentPanel(rows, options).finished).toHaveLength(2);
  });

  it("caps each list and keeps the newest-first order it was given", () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      row({ vid: `v${index}`, ts: NOW - index * 60, dwell: 900, dur: 1000, title: `第 ${index}` }),
    );
    const result = proContentPanel(rows, options);
    expect(result.finished).toHaveLength(PRO_LIST_LIMIT);
    expect(result.finished[0]?.title).toBe("第 0");
    expect(result.finished[PRO_LIST_LIMIT - 1]?.title).toBe(`第 ${PRO_LIST_LIMIT - 1}`);
  });
});
