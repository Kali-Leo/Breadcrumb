/**
 * Purpose: the reading-time estimate (spec 054 §(d)). The number a card prints is a promise about
 * the reader's next ten minutes, so what matters here is less the exact minute than that it is
 * never invented: too little text, or text we do not hold at all, has to come back as nothing.
 */
import { describe, expect, it } from "vitest";
import {
  CHINESE_CHARACTERS_PER_MINUTE,
  estimateReadingMinutes,
  MINIMUM_CHARACTERS_TO_ESTIMATE,
  WESTERN_WORDS_PER_MINUTE,
} from "./discoveryReadingTime";

function chinese(characters: number): string {
  return "记忆宫殿的墙上写着一句话".repeat(Math.ceil(characters / 12)).slice(0, characters);
}

function englishWords(count: number): string {
  return Array.from({ length: count }, () => "steady").join(" ");
}

describe("estimateReadingMinutes", () => {
  it("has nothing to say about a card whose text we do not hold", () => {
    expect(estimateReadingMinutes(null)).toBeNull();
  });

  /** A card's hook is a clipped teaser of a few dozen characters. Timing it would print a
   * confident number about an article nobody has fetched yet. */
  it("has nothing to say about a teaser", () => {
    expect(estimateReadingMinutes("一篇讲海马体如何整理白天见闻的短文")).toBeNull();
    expect(estimateReadingMinutes(chinese(MINIMUM_CHARACTERS_TO_ESTIMATE - 1))).toBeNull();
  });

  it("counts Chinese at the chosen characters-per-minute", () => {
    const characters = CHINESE_CHARACTERS_PER_MINUTE * 6;
    expect(estimateReadingMinutes(chinese(characters))).toBe(6);
  });

  it("counts English at the chosen words-per-minute", () => {
    expect(estimateReadingMinutes(englishWords(WESTERN_WORDS_PER_MINUTE * 4))).toBe(4);
  });

  it("adds the two up in a text that mixes them", () => {
    const mixed = `${chinese(CHINESE_CHARACTERS_PER_MINUTE * 2)}\n\n${englishWords(
      WESTERN_WORDS_PER_MINUTE * 3,
    )}`;
    expect(estimateReadingMinutes(mixed)).toBe(5);
  });

  it("rounds up to a whole minute rather than saying zero", () => {
    expect(estimateReadingMinutes(chinese(MINIMUM_CHARACTERS_TO_ESTIMATE))).toBe(1);
  });

  /** A page of links is not ten minutes of reading: the addresses are not read, and neither is the
   * markdown around them. */
  it("does not count link addresses or picture markup as reading", () => {
    const words = englishWords(WESTERN_WORDS_PER_MINUTE * 2);
    const linked = `${words}\n\n![cover](https://example.org/${"a".repeat(4000)}.jpg)\n\n[看原文](https://example.org/${"b".repeat(
      4000,
    )})`;
    expect(estimateReadingMinutes(linked)).toBe(2);
  });

  it("does not count fenced code as reading", () => {
    const words = englishWords(WESTERN_WORDS_PER_MINUTE * 2);
    const withCode = `${words}\n\n\`\`\`\n${englishWords(WESTERN_WORDS_PER_MINUTE * 20)}\n\`\`\``;
    expect(estimateReadingMinutes(withCode)).toBe(2);
  });

  it("has nothing to say about a long string with nothing readable in it", () => {
    expect(estimateReadingMinutes("=".repeat(MINIMUM_CHARACTERS_TO_ESTIMATE * 2))).toBeNull();
  });
});
