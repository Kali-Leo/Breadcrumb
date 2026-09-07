import { describe, expect, it } from "vitest";
import type { BrowsingEventRow } from "../events";
import type { ProfileDistributions } from "../profileShares";
import { TOPIC_LEAVES } from "../taxonomy";
import {
  MIN_ENGAGED_FOR_NEW_INTERESTS,
  NEW_INTEREST_ITEM_DAYS,
  newInterests,
} from "./newInterests";

const DAY = 86400;
const NOW = 400 * DAY;

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
    topic: 0,
    emo: null,
    valence: null,
    pic: "",
    classifier: "ngram",
    ...overrides,
  };
}

function distributions(short: Record<number, number>, long: Record<number, number> = {}) {
  const build = (values: Record<number, number>): number[] => {
    const vector = new Array<number>(48).fill(0);
    for (const [index, value] of Object.entries(values)) vector[Number(index)] = value;
    return vector;
  };
  return {
    short: build(short),
    long: build(long),
    expose: build({}),
  } satisfies ProfileDistributions;
}

const enough = MIN_ENGAGED_FOR_NEW_INTERESTS;

describe("newInterests", () => {
  it("says nothing at all below the evidence floor, however striking the numbers look", () => {
    const result = newInterests({
      distributions: distributions({ 0: 0.9 }),
      engagedCount: enough - 1,
      rows: [row()],
      now: NOW,
    });
    expect(result.interests).toEqual([]);
  });

  it("says nothing when there are no events at all", () => {
    expect(
      newInterests({ distributions: distributions({}), engagedCount: 0, rows: [], now: NOW })
        .interests,
    ).toEqual([]);
  });

  it("names a topic that is both substantial and well above its settled share", () => {
    const result = newInterests({
      distributions: distributions({ 3: 0.2 }, { 3: 0.01 }),
      engagedCount: enough,
      rows: [row({ topic: 3 })],
      now: NOW,
    });
    expect(result.interests).toHaveLength(1);
    expect(result.interests[0]?.topic).toBe(TOPIC_LEAVES[3]);
    expect(result.interests[0]?.topic_en).toBeTruthy();
    expect(result.interests[0]?.share).toBe(0.2);
    expect(result.interests[0]?.before).toBe(0.01);
    expect(result.interests[0]?.items).toHaveLength(1);
  });

  it("stays quiet about a topic that is large but has always been large", () => {
    const result = newInterests({
      distributions: distributions({ 3: 0.2 }, { 3: 0.19 }),
      engagedCount: enough,
      rows: [],
      now: NOW,
    });
    expect(result.interests).toEqual([]);
  });

  it("stays quiet about a topic that rose sharply but is still tiny", () => {
    const result = newInterests({
      distributions: distributions({ 3: 0.02 }, { 3: 0.0001 }),
      engagedCount: enough,
      rows: [],
      now: NOW,
    });
    expect(result.interests).toEqual([]);
  });

  it("floors the settled share, so a first-ever topic still has to clear a real bar", () => {
    const justUnder = newInterests({
      distributions: distributions({ 5: 0.009 }, { 5: 0 }),
      engagedCount: enough,
      rows: [],
      now: NOW,
    });
    expect(justUnder.interests).toEqual([]);
  });

  it("counts a click and a watch of the same video as one thing that happened", () => {
    const result = newInterests({
      distributions: distributions({ 3: 0.2 }, { 3: 0.01 }),
      engagedCount: enough,
      rows: [
        row({ topic: 3, vid: "same", etype: "click", ts: NOW - 100 }),
        row({ topic: 3, vid: "same", etype: "watch", title: "较新的标题" }),
      ],
      now: NOW,
    });
    expect(result.interests[0]?.items).toHaveLength(1);
    expect(result.interests[0]?.items[0]?.title).toBe("较新的标题");
  });

  it("shows at most three items, newest first, from inside the item window only", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) =>
        row({ topic: 3, vid: `v${index}`, ts: NOW - index * 3600, title: `新 ${index}` }),
      ),
      row({ topic: 3, vid: "old", ts: NOW - (NEW_INTEREST_ITEM_DAYS + 1) * DAY, title: "太旧" }),
    ];
    const items = newInterests({
      distributions: distributions({ 3: 0.2 }, { 3: 0.01 }),
      engagedCount: enough,
      rows,
      now: NOW,
    }).interests[0]?.items;
    expect(items?.map((item) => item.title)).toEqual(["新 0", "新 1", "新 2"]);
  });

  it("ignores exposures when illustrating — the panel is about what was chosen", () => {
    const items = newInterests({
      distributions: distributions({ 3: 0.2 }, { 3: 0.01 }),
      engagedCount: enough,
      rows: [row({ topic: 3, etype: "expose", vid: "shown" })],
      now: NOW,
    }).interests[0]?.items;
    expect(items).toEqual([]);
  });

  it("returns at most six topics, largest share first", () => {
    const short: Record<number, number> = {};
    for (let topic = 0; topic < 12; topic++) short[topic] = 0.04 + topic * 0.001;
    const result = newInterests({
      distributions: distributions(short),
      engagedCount: enough,
      rows: [],
      now: NOW,
    });
    expect(result.interests).toHaveLength(6);
    const shares = result.interests.map((interest) => interest.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    expect(result.interests[0]?.topic).toBe(TOPIC_LEAVES[11]);
  });
});
