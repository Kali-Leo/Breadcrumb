/**
 * Purpose: the segmenter has to find the words the app's own vocabulary is made of, and has
 * to degrade honestly on text its dictionary has never seen.
 */
import { describe, expect, it } from "vitest";
import { CHINESE_WORD_COUNT, segmentChinese } from "./chineseSegmenter";

describe("segmentChinese", () => {
  it("carries a dictionary worth having", () => {
    expect(CHINESE_WORD_COUNT).toBeGreaterThan(10_000);
  });

  it("splits ordinary study text into words, not character pairs", () => {
    expect(segmentChinese("函数是数学概念")).toContain("函数");
    expect(segmentChinese("函数是数学概念")).toContain("数学");
    expect(segmentChinese("我在学习计算机科学")).toContain("学习");
    expect(segmentChinese("我在学习计算机科学")).toContain("计算机");
  });

  it("prefers the longest word that starts where it stands", () => {
    // 计算 and 计算机 are both words; maximum matching must take the longer one.
    expect(segmentChinese("计算机")).toEqual(["计算机"]);
  });

  it("still produces something to match on for words it has never seen", () => {
    const tokens = segmentChinese("蒹葭苍苍");
    // Unknown run: characters plus their bigrams, the behaviour this replaced.
    expect(tokens).toContain("蒹");
    expect(tokens.some((token) => token.length === 2)).toBe(true);
  });

  it("has nothing to say about an empty run", () => {
    expect(segmentChinese("")).toEqual([]);
  });
});
