/**
 * Purpose: tests for the vocabulary placement check — the test covers the whole queue, every
 * item is answerable, and the score is conservative in the ways the design promises.
 */
import { describe, expect, it } from "vitest";
import { loadLanguagePack } from "./packSchema";
import { buildVocabTest, scoreVocabTest, VOCAB_TEST_ITEM_COUNT } from "./vocabTest";

/** A synthetic pack with a long, ordered queue: lemma-0000 is the most frequent word. */
function packWithQueue(size: number) {
  const entries: Record<string, unknown> = {};
  for (let index = 0; index < size; index += 1) {
    const lemma = `lemma-${String(index).padStart(4, "0")}`;
    entries[lemma] = {
      target: `target-${index}`,
      pos: "n",
      reading: "",
      altTargets: [],
      freqRank: index + 1,
      t1Safe: true,
    };
  }
  return loadLanguagePack({
    schemaVersion: 1,
    id: "zh:en",
    sourceLang: "zh",
    targetLang: "en",
    version: "2026.09.01",
    attribution: ["test"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: {},
    entries,
  });
}

describe("buildVocabTest", () => {
  it("asks thirty questions spread across the whole queue", () => {
    const items = buildVocabTest(packWithQueue(3000));
    expect(items).toHaveLength(VOCAB_TEST_ITEM_COUNT);
    const ranks = items.map((item) => item.queueRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBeLessThan(200);
    expect(ranks.at(-1)).toBeGreaterThan(2700);
  });

  it("gives every item four distinct options, one of them right", () => {
    for (const item of buildVocabTest(packWithQueue(3000))) {
      expect(new Set(item.options).size).toBe(4);
      expect(item.options[item.correctIndex]).toBe(item.lemma);
    }
  });

  it("is the same test when it is built again", () => {
    expect(buildVocabTest(packWithQueue(3000))).toEqual(buildVocabTest(packWithQueue(3000)));
  });

  it("declines to run on a pack too small to ask thirty distinct questions", () => {
    expect(buildVocabTest(packWithQueue(40))).toEqual([]);
  });
});

describe("scoreVocabTest", () => {
  const items = buildVocabTest(packWithQueue(3000));

  it("starts a beginner at the beginning", () => {
    const allWrong = items.map((item) => (item.correctIndex + 1) % 4);
    expect(scoreVocabTest(items, allWrong)).toBe(0);
  });

  it("treats a skipped test exactly like a beginner's", () => {
    expect(
      scoreVocabTest(
        items,
        items.map(() => null),
      ),
    ).toBe(0);
  });

  it("puts someone who knows the whole list deep into it, but not at its end", () => {
    const allRight = items.map((item) => item.correctIndex);
    const floor = scoreVocabTest(items, allRight);
    expect(floor).toBeGreaterThan(2000);
    expect(floor).toBeLessThan(3000);
  });

  it("is not fooled by a lucky deep band after guessing through the easy ones", () => {
    // Wrong everywhere except the very last band, which comes out right by chance. Without an
    // unbroken run this used to hand a guesser the deepest floor in the test.
    const luckyTail = items.map((item, index) =>
      index >= items.length - 5 ? item.correctIndex : (item.correctIndex + 1) % 4,
    );
    expect(scoreVocabTest(items, luckyTail)).toBe(0);
  });

  it("stops one band short of where the answers stopped holding up", () => {
    // Right through the first half, guessing wrong after it.
    const half = items.map((item, index) =>
      index < items.length / 2 ? item.correctIndex : (item.correctIndex + 1) % 4,
    );
    const floor = scoreVocabTest(items, half);
    const lastCorrectRank = items[Math.floor(items.length / 2) - 1]?.queueRank ?? 0;
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(lastCorrectRank);
  });
});
