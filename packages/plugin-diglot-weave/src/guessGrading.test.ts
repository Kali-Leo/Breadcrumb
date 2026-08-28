/**
 * Purpose: tests for zero-LLM guess grading — exact and dictionary-synonym correctness,
 * morphological closeness, embedding-based closeness with its offline degradation, and the
 * antonym regression the character-overlap measure used to produce (spec 033, acceptance
 * 2/3; audit 2026-08-28 #4).
 */
import { describe, expect, it } from "vitest";
import { gradeGuess, SEMANTIC_CLOSE_THRESHOLD } from "./guessGrading";
import { type LoadedLanguagePack, loadLanguagePack } from "./packSchema";
import { makeEnFrPack, makeZhEnPack } from "./testFixture";

/** The audit's real-pack counter-examples: Chinese antonyms share a morpheme. */
function makeAntonymPack(): LoadedLanguagePack {
  const entry = (target: string, freqRank: number) => ({
    target,
    pos: "n",
    reading: "",
    altTargets: [],
    freqRank,
    t1Safe: true,
  });
  return loadLanguagePack({
    schemaVersion: 1,
    id: "zh:en",
    sourceLang: "zh",
    targetLang: "en",
    version: "test",
    attribution: ["test fixture"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: {},
    entries: {
      父亲: entry("father", 700),
      母亲: entry("mother", 710),
      敌人: entry("enemy", 800),
      朋友: entry("friend", 120),
      男孩: entry("boy", 300),
      女孩: entry("girl", 310),
      昨天: entry("yesterday", 200),
      明天: entry("tomorrow", 210),
    },
  });
}

describe("gradeGuess", () => {
  it("grades the exact original word as correct", () => {
    expect(gradeGuess("书本", "书本", "书本", makeZhEnPack())).toBe("correct");
    expect(gradeGuess(" Book ", "books", "book", makeEnFrPack())).toBe("correct");
  });

  it("grades dictionary synonyms (same target) as correct", () => {
    // 书籍 and 书本 both translate to "book".
    expect(gradeGuess("书籍", "书本", "书本", makeZhEnPack())).toBe("correct");
    expect(gradeGuess("tome", "books", "book", makeEnFrPack())).toBe("correct");
  });

  it("grades morphological variants as close", () => {
    expect(gradeGuess("booke", "books", "book", makeEnFrPack())).toBe("close");
    expect(gradeGuess("reading", "read", "read", makeEnFrPack())).toBe("close");
  });

  it("grades a semantically near guess as close only when the embedding says so", () => {
    const pack = makeZhEnPack();
    const near = { similarity: SEMANTIC_CLOSE_THRESHOLD + 0.02 };
    // 本子 (notebook) is not in the pack, shares no morpheme rule — meaning is the only clue.
    expect(gradeGuess("本子", "书本", "书本", pack, near)).toBe("close");
    expect(gradeGuess("本子", "书本", "书本", pack, { similarity: 0.6 })).toBe("wrong");
  });

  it("degrades to correct-or-wrong when embeddings are unavailable", () => {
    const pack = makeZhEnPack();
    expect(gradeGuess("本子", "书本", "书本", pack, { similarity: null })).toBe("wrong");
    expect(gradeGuess("本子", "书本", "书本", pack)).toBe("wrong");
  });

  it("never grades an antonym as close, whatever the embedding says", () => {
    const pack = makeAntonymPack();
    const veryNear = { similarity: 0.99 };
    for (const [original, guess] of [
      ["父亲", "母亲"],
      ["敌人", "朋友"],
      ["男孩", "女孩"],
      ["昨天", "明天"],
    ]) {
      expect(original).toBeDefined();
      expect(gradeGuess(guess ?? "", original ?? "", original ?? "", pack, veryNear)).toBe("wrong");
      expect(gradeGuess(guess ?? "", original ?? "", original ?? "", pack)).toBe("wrong");
    }
  });

  it("grades unrelated or empty guesses as wrong", () => {
    expect(gradeGuess("朋友", "书本", "书本", makeZhEnPack())).toBe("wrong");
    expect(gradeGuess("   ", "books", "book", makeEnFrPack())).toBe("wrong");
  });
});
