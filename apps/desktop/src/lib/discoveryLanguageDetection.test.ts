/**
 * Purpose: unit tests for reading a card's language off its own words (spec 054). The rule the
 * feed depends on is not "gets it right" but "never guesses": every case where the text is short,
 * mixed or wordless has to come back null, because null keeps the card.
 */
import { describe, expect, it } from "vitest";
import { detectTextLanguage } from "./discoveryLanguageDetection";

describe("text that says clearly what it is", () => {
  it("reads a Chinese sentence as Chinese", () => {
    expect(detectTextLanguage("研究人员发现睡眠对记忆的巩固有直接影响")).toBe("chinese");
  });

  it("reads an English sentence as English", () => {
    expect(
      detectTextLanguage("Researchers found that sleep directly shapes how memory settles"),
    ).toBe("english");
  });

  it("reads a Chinese headline carrying an English product name as Chinese", () => {
    expect(detectTextLanguage("苹果发布新款 MacBook Pro，芯片换成 M5")).toBe("chinese");
  });

  it("reads an English headline quoting a Chinese name as English", () => {
    expect(detectTextLanguage("Huawei 华为 opens its own store in Shenzhen this week")).toBe(
      "english",
    );
  });
});

describe("text in a script the feed cannot be set to", () => {
  it("reads Japanese by its kana, so a Japanese caption is not taken for Chinese", () => {
    expect(detectTextLanguage("この写真は昨日の夕方に撮影されたものです")).toBe("japanese");
  });

  it("reads Korean by its hangul", () => {
    expect(detectTextLanguage("한국어로 쓴 문장입니다 오늘 날씨가 좋습니다")).toBe("korean");
  });

  it("reads other scripts as other", () => {
    expect(detectTextLanguage("Международная космическая станция вернулась")).toBe("other");
  });

  it("takes Japanese written without kana for Chinese — the known limit, stated in the code", () => {
    expect(detectTextLanguage("東京都市計画道路建設事業概要")).toBe("chinese");
  });
});

describe("text that does not say", () => {
  it("says nothing about a title too short to judge", () => {
    expect(detectTextLanguage("Hacker News")).toBeNull();
    expect(detectTextLanguage("维基百科")).toBeNull();
  });

  it("says nothing about punctuation and emoji", () => {
    expect(detectTextLanguage("!!! ??? … 🎉🎉🎉 ——— 「」")).toBeNull();
    expect(detectTextLanguage("")).toBeNull();
  });

  it("says nothing about text that is genuinely half and half", () => {
    expect(
      detectTextLanguage("Transformer 架构 self attention 机制 详解 tutorial for beginners"),
    ).toBeNull();
  });

  it("ignores addresses, so a Chinese summary ending in a long link is still Chinese", () => {
    const text = "这篇文章讲的是记忆的巩固过程 https://example.org/very/long/english/path/here";
    expect(detectTextLanguage(text)).toBe("chinese");
  });
});

describe("text made mostly of code", () => {
  it("says nothing about a short snippet", () => {
    expect(detectTextLanguage("const x = 1;")).toBeNull();
  });

  it("reads a long snippet as English, which is where its source already was", () => {
    const snippet = "function computeAdjacencyMatrix(graph) { return graph.nodes.map(toRow); }";
    expect(detectTextLanguage(snippet)).toBe("english");
  });
});
