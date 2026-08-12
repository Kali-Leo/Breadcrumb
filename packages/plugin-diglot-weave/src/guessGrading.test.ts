/**
 * Purpose: tests for zero-LLM guess grading — exact, dictionary-synonym, character-overlap
 * and edit-distance closeness, and the wrong fallback (spec 033, acceptance 2/3).
 */
import { describe, expect, it } from "vitest";
import { gradeGuess } from "./guessGrading";
import { makeEnFrPack, makeZhEnPack } from "./testFixture";

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

  it("grades strong partial matches as close", () => {
    // Shares 本 with 书本: 50% character overlap.
    expect(gradeGuess("本子", "书本", "书本", makeZhEnPack())).toBe("close");
    expect(gradeGuess("booke", "books", "book", makeEnFrPack())).toBe("close");
  });

  it("grades unrelated or empty guesses as wrong", () => {
    expect(gradeGuess("朋友", "书本", "书本", makeZhEnPack())).toBe("wrong");
    expect(gradeGuess("   ", "books", "book", makeEnFrPack())).toBe("wrong");
  });
});
