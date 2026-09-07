import { describe, expect, it } from "vitest";
import type { BrowsingEventRow } from "../events";
import { EMOTION_COUNT, PRO_TOPIC_INDICES } from "../taxonomy";
import { emotionSeries } from "./emotionSeries";

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
    etype: "click",
    dwell: 0,
    dur: 0,
    topic: PRO,
    emo: 0,
    valence: 1,
    pic: "",
    classifier: "ngram",
    ...overrides,
  };
}

const options = { days: 90, category: "all", now: NOW } as const;

describe("emotionSeries", () => {
  it("says nothing on no events, but still names the emotion scale", () => {
    const series = emotionSeries([], options);
    expect(series.expose).toEqual([]);
    expect(series.engage).toEqual([]);
    expect(series.emotions).toHaveLength(EMOTION_COUNT);
    expect(series.valences).toHaveLength(EMOTION_COUNT);
  });

  it("puts a single event on its own day, with the mix entirely on its emotion", () => {
    const series = emotionSeries([row({ emo: 2, valence: 1.5 })], options);
    expect(series.engage).toHaveLength(1);
    const point = series.engage[0];
    expect(point?.day).toBe(NOW);
    expect(point?.n).toBe(1);
    expect(point?.valence).toBe(1.5);
    expect(point?.mix[2]).toBe(1);
    expect(point?.mix.reduce((sum, value) => sum + value, 0)).toBe(1);
  });

  it("keeps what was shown apart from what was opened", () => {
    const series = emotionSeries(
      [row({ etype: "expose", valence: -1 }), row({ etype: "watch", valence: 2 })],
      options,
    );
    expect(series.expose[0]?.valence).toBe(-1);
    expect(series.engage[0]?.valence).toBe(2);
  });

  it("averages a day and buckets many events into ascending days", () => {
    const rows = [
      row({ ts: NOW - 2 * DAY, valence: 0 }),
      row({ ts: NOW - 2 * DAY + 3600, valence: 2 }),
      row({ ts: NOW, valence: -1 }),
    ];
    const series = emotionSeries(rows, options);
    expect(series.engage.map((point) => point.day)).toEqual([
      Math.trunc((NOW - 2 * DAY) / DAY) * DAY,
      NOW,
    ]);
    expect(series.engage[0]?.valence).toBe(1);
    expect(series.engage[0]?.n).toBe(2);
  });

  it("drops rows nothing classified an emotion for, rather than charting them as neutral", () => {
    expect(emotionSeries([row({ valence: null, emo: null })], options).engage).toEqual([]);
  });

  it("counts an event whose emotion index is out of range but keeps its valence", () => {
    const point = emotionSeries([row({ emo: 99 })], options).engage[0];
    expect(point?.n).toBe(1);
    expect(point?.mix.every((value) => value === 0)).toBe(true);
  });

  it("ignores anything older than the window", () => {
    expect(emotionSeries([row({ ts: NOW - 200 * DAY })], options).engage).toEqual([]);
  });

  it("filters by content category, and leaves unclassified rows out of every topic filter", () => {
    const rows = [row({ topic: PRO }), row({ topic: ENT }), row({ topic: null })];
    expect(emotionSeries(rows, { ...options, category: "all" }).engage[0]?.n).toBe(3);
    expect(emotionSeries(rows, { ...options, category: "pro" }).engage[0]?.n).toBe(1);
    expect(emotionSeries(rows, { ...options, category: "ent" }).engage[0]?.n).toBe(1);
  });

  it("gent keeps only the positive half of entertainment — a filter, not a finding", () => {
    const rows = [row({ topic: ENT, valence: 0.4 }), row({ topic: ENT, valence: 0.6 })];
    const point = emotionSeries(rows, { ...options, category: "gent" }).engage[0];
    expect(point?.n).toBe(1);
    expect(point?.valence).toBe(0.6);
  });

  it("handles a long history without losing the day boundaries", () => {
    const rows = Array.from({ length: 300 }, (_, index) =>
      row({ ts: NOW - index * (DAY / 3), valence: (index % 5) - 2 }),
    );
    const series = emotionSeries(rows, options);
    expect(series.engage.length).toBeGreaterThan(80);
    expect(series.engage.reduce((sum, point) => sum + point.n, 0)).toBe(
      rows.filter((each) => each.ts >= NOW - 90 * DAY).length,
    );
    const days = series.engage.map((point) => point.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });
});
