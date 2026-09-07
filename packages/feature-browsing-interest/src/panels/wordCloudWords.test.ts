import { describe, expect, it } from "vitest";
import type { BrowsingEventRow } from "../events";
import { titleWords, WORD_CLOUD_LIMIT, wordCloudWords } from "./wordCloudWords";

const DAY = 86400;
const NOW = 400 * DAY;

function row(title: string, overrides: Partial<BrowsingEventRow> = {}): BrowsingEventRow {
  return {
    ts: NOW,
    site: "bilibili",
    vid: "v1",
    title,
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

const engage = { days: 90, source: "engage", now: NOW } as const;
const wordsOf = (cloud: { words: ReadonlyArray<{ w: string }> }): string[] =>
  cloud.words.map((word) => word.w);

describe("titleWords", () => {
  it("segments Han runs and keeps other runs whole", () => {
    expect(titleWords("学习 Rust 编程")).toContain("Rust");
    expect(titleWords("学习")).toEqual(["学习"]);
  });

  it("splits on punctuation without emitting it", () => {
    expect(titleWords("【标题】")).not.toContain("【");
  });
});

describe("wordCloudWords", () => {
  it("returns an empty cloud for no events, still naming the window it looked at", () => {
    const cloud = wordCloudWords([], engage);
    expect(cloud.words).toEqual([]);
    expect(cloud.days).toBe(90);
    expect(cloud.source).toBe("engage");
  });

  it("counts a word once per title, however often the title repeats it", () => {
    const cloud = wordCloudWords([row("学习 学习 学习")], engage);
    expect(cloud.words.find((word) => word.w === "学习")?.n).toBe(1);
  });

  it("counts a word once per title it appears in", () => {
    const cloud = wordCloudWords([row("学习方法"), row("学习计划"), row("旅行")], engage);
    expect(cloud.words[0]?.w).toBe("学习");
    expect(cloud.words[0]?.n).toBe(2);
  });

  it("drops single characters, stop words and pure ASCII or digits", () => {
    const cloud = wordCloudWords([row("的 我 是 2024 Rust __ 编程")], engage);
    expect(wordsOf(cloud)).not.toContain("的");
    expect(wordsOf(cloud)).not.toContain("2024");
    expect(wordsOf(cloud)).not.toContain("Rust");
    expect(wordsOf(cloud)).toContain("编程");
  });

  it("keeps what was shown apart from what was opened", () => {
    const rows = [row("编程语言", { etype: "expose" }), row("红烧肉", { etype: "watch" })];
    // 红烧肉 is not a dictionary entry, so it falls back to character bigrams — the documented
    // difference from jieba, whose HMM pass would have guessed the whole word.
    expect(wordsOf(wordCloudWords(rows, engage))).toContain("红烧");
    expect(wordsOf(wordCloudWords(rows, { ...engage, source: "expose" }))).toContain("编程");
  });

  it("prefers the shipped lexicon over the learner's own handful of observations", () => {
    // 挑战 is in word_valence.json; a lexicon entry must outrank two contrary observations.
    const rows = [row("挑战自我", { valence: -2 }), row("挑战极限", { valence: -2 })];
    const value = wordCloudWords(rows, engage).words.find((word) => word.w === "挑战")?.valence;
    expect(value).toBeGreaterThan(0);
  });

  it("falls back to the average valence of the titles a word appeared in", () => {
    const rows = [
      row("量子纠缠实验", { valence: 1 }),
      row("量子纠缠观测", { valence: 2, vid: "v2" }),
    ];
    const value = wordCloudWords(rows, engage).words.find((word) => word.w === "量子")?.valence;
    expect(value).toBe(1.5);
  });

  it("reads a word with no lexicon entry and no valenced title as neutral", () => {
    const value = wordCloudWords([row("量子纠缠")], engage).words.find(
      (word) => word.w === "量子",
    )?.valence;
    expect(value).toBe(0);
  });

  it("ignores anything older than the window", () => {
    expect(wordCloudWords([row("编程语言", { ts: NOW - 200 * DAY })], engage).words).toEqual([]);
  });

  it("caps a large history at the cloud size, most frequent first", () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      row(`学习${String.fromCodePoint(0x4e00 + index)}方法`, { vid: `v${index}` }),
    );
    const cloud = wordCloudWords(rows, engage);
    expect(cloud.words).toHaveLength(WORD_CLOUD_LIMIT);
    const counts = cloud.words.map((word) => word.n);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(cloud.words[0]?.n).toBe(500);
  });
});
