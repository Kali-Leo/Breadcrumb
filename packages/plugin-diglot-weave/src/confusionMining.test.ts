/**
 * Purpose: tests for confusion mining — systematic pairs surface, noise and correct
 * guesses don't, best partner wins deterministically (vision/09 #3).
 */
import type { DiglotWordGuessRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { mineConfusionPairs } from "./confusionMining";
import { makeZhEnPack } from "./testFixture";

function guess(lemma: string, guessText: string, grade: DiglotWordGuessRow["grade"]) {
  return {
    id: `${lemma}-${guessText}-${Math.abs(guessText.length)}`,
    lemma,
    pair: "zh:en",
    guess: guessText,
    grade,
    context: "",
    latency_ms: 1000,
    created_at: "t",
  } as DiglotWordGuessRow;
}

describe("mineConfusionPairs", () => {
  const loaded = makeZhEnPack();

  it("surfaces a systematic confusion pair with its translation", () => {
    const partners = mineConfusionPairs(
      [guess("书本", "朋友", "wrong"), guess("书本", "朋友", "wrong")],
      loaded,
    );
    expect(partners.get("书本")).toEqual({ lemma: "朋友", target: "friend", count: 2 });
  });

  it("ignores one-off slips, correct guesses and non-dictionary guesses", () => {
    const partners = mineConfusionPairs(
      [
        guess("书本", "朋友", "wrong"), // only once — noise
        guess("书本", "书本", "correct"),
        guess("喜欢", "随便什么", "wrong"),
      ],
      loaded,
    );
    expect(partners.size).toBe(0);
  });

  it("resolves traditional surface forms via the forms table", () => {
    const partners = mineConfusionPairs(
      [guess("朋友", "書本", "wrong"), guess("朋友", "书本", "close")],
      loaded,
    );
    expect(partners.get("朋友")?.lemma).toBe("书本");
    expect(partners.get("朋友")?.count).toBe(2);
  });
});
