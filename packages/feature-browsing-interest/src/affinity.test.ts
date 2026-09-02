import { describe, expect, it } from "vitest";
import {
  BROWSING_RECENCY_HALF_LIFE_DAYS,
  browsingAffinityByNode,
  type WatchedTitleVector,
  watchedTitleSignals,
  watchedTitleWeight,
} from "./affinity";
import type { ProContent } from "./schemas";

/** 2-D unit vector at the given angle — cosine between two of these is cos(Δangle),
 * which makes every similarity in a fixture directly controllable. */
const vec = (degrees: number): number[] => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
};

const title = (name: string, weight: number, vector: number[]): WatchedTitleVector => ({
  title: name,
  weight,
  vector,
});

describe("watchedTitleWeight", () => {
  it("finished today is full weight, unfinished half, and both decay on the half-life", () => {
    expect(watchedTitleWeight(true, 0)).toBe(1);
    expect(watchedTitleWeight(false, 0)).toBe(0.5);
    expect(watchedTitleWeight(true, BROWSING_RECENCY_HALF_LIFE_DAYS)).toBeCloseTo(0.5);
    expect(watchedTitleWeight(false, BROWSING_RECENCY_HALF_LIFE_DAYS)).toBeCloseTo(0.25);
  });

  it("a clock skewed into the future cannot inflate weight past its base", () => {
    expect(watchedTitleWeight(true, -5)).toBe(1);
  });
});

describe("watchedTitleSignals", () => {
  const item = (t: string, ts: number) => ({
    ts,
    id: "v",
    title: t,
    up: "",
    topic: "编程与软件开发",
    group: "",
    pic: "",
    dwell: 60,
    dur: 60,
    site: "bilibili",
  });
  const nowMillis = 1_000_000_000 * 1000;

  it("dedupes overlapping titles keeping the strongest weight, and drops empty titles", () => {
    const pro: ProContent = {
      days: 30,
      finished: [item("同一个视频", 1_000_000_000), item("", 1_000_000_000)],
      unfinished: [item("同一个视频", 1_000_000_000), item("只开了个头", 1_000_000_000)],
    };
    const signals = watchedTitleSignals(pro, nowMillis);
    expect(signals.map((signal) => signal.title).sort()).toEqual(["只开了个头", "同一个视频"]);
    const dup = signals.find((signal) => signal.title === "同一个视频");
    expect(dup?.weight).toBe(1); // finished (1.0) beats unfinished (0.5)
  });
});

describe("browsingAffinityByNode", () => {
  it("returns empty for no titles and for fewer than two nodes (no landscape)", () => {
    const twoNodes = new Map([
      ["n1", vec(0)],
      ["n2", vec(90)],
    ]);
    expect(browsingAffinityByNode([], twoNodes).size).toBe(0);
    expect(browsingAffinityByNode([title("t", 1, vec(0))], new Map([["only", vec(0)]])).size).toBe(
      0,
    );
  });

  it("lends affinity only to the node that stands out of the title's own landscape", () => {
    const nodes = new Map([
      ["rust", vec(0)],
      ["cooking", vec(60)],
      ["history", vec(90)],
    ]);
    const result = browsingAffinityByNode([title("Rust 所有权详解", 1, vec(5))], nodes);
    expect(result.get("rust") ?? 0).toBeGreaterThan(0);
    expect(result.has("cooking")).toBe(false);
    expect(result.has("history")).toBe(false);
  });

  it("a title equally near every node (flat landscape) crowns no node at all", () => {
    // The real model packs everything into a narrow band — mimic it: nodes 30°/33°/36°,
    // title at 33°: sims ≈ 0.999/1/0.999, spread far below MIN_AFFINITY_EXCESS.
    const nodes = new Map([
      ["a", vec(30)],
      ["b", vec(33)],
      ["c", vec(36)],
    ]);
    const result = browsingAffinityByNode([title("红烧肉的做法", 1, vec(33))], nodes);
    expect(result.size).toBe(0);
  });

  it("max-pooling: the strongest weighted match wins and unrelated titles do not dilute", () => {
    const nodes = new Map([
      ["rust", vec(0)],
      ["far1", vec(80)],
      ["far2", vec(100)],
    ]);
    const result = browsingAffinityByNode(
      [
        title("弱一点的 Rust 视频", 0.3, vec(10)),
        title("Rust 所有权详解", 0.9, vec(2)),
        title("完全无关", 1, vec(90)), // its standouts are far1/far2's own flat pair — tiny excess
      ],
      nodes,
    );
    // The strong title alone would score weight 0.9 × its excess; the weak one caps far
    // below that. Max-pooling must keep the strong title's score.
    const weakAlone = browsingAffinityByNode([title("弱一点的 Rust 视频", 0.3, vec(10))], nodes);
    expect(result.get("rust") ?? 0).toBeGreaterThan(weakAlone.get("rust") ?? 0);
  });

  it("weight scales the score: a fresher viewing outranks a stale one on the same node", () => {
    const nodes = new Map([
      ["node", vec(0)],
      ["far", vec(90)],
    ]);
    const stale = title("三个月前看完的", watchedTitleWeight(true, 90), vec(0));
    const fresh = title("昨天看完的", watchedTitleWeight(true, 1), vec(0));
    const both = browsingAffinityByNode([stale, fresh], nodes);
    const staleAlone = browsingAffinityByNode([stale], nodes);
    // The fresh viewing's weight dominates the max — adding it must raise the score.
    expect(both.get("node") ?? 0).toBeGreaterThan(staleAlone.get("node") ?? 0);
  });

  it("journey tripwire: scores stay in (0,1] and no title text leaks into the result", () => {
    const nodes = new Map(
      Array.from({ length: 8 }, (_, index) => [`n${index}`, vec(index * 22)] as const),
    );
    const week = [
      title("Rust 所有权与借用检查器", watchedTitleWeight(true, 1), vec(3)),
      title("看了一半的明史讲座", watchedTitleWeight(false, 3), vec(45)),
      title("红烧肉的做法", watchedTitleWeight(true, 2), vec(130)),
    ];
    const result = browsingAffinityByNode(week, nodes);
    expect(result.size).toBeGreaterThan(0);
    for (const score of result.values()) {
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    // Leo 裁决 2026-08-30: titles stop inside this computation — the result is numbers only.
    expect(JSON.stringify([...result.entries()])).not.toContain("Rust");
  });
});
