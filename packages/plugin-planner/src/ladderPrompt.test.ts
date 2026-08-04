/**
 * Purpose: unit tests for the ladder-generation LLM contract — prompt construction
 * (domain sample, forbidden list) and validateLadderGeneration's forbidden-description drop,
 * distinct-milestone dedup, minimum-valid-figures failure, and milestone-sorted positions.
 */
import { describe, expect, it } from "vitest";
import {
  buildLadderGenerationMessages,
  type LadderGenerationResult,
  MIN_VALID_LADDER_FIGURES,
  validateLadderGeneration,
} from "./ladderPrompt";

function figures(entries: [string, number][]): LadderGenerationResult["figures"] {
  return entries.map(([figureDesc, milestone]) => ({
    figureDesc,
    figureNote: "note",
    milestone,
  }));
}

describe("buildLadderGenerationMessages", () => {
  it("embeds the goal title, domain sample, current milestone and forbidden list", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "通过考研数学",
      domainLabelsSample: ["极限", "导数"],
      userMilestone: 42,
      forbiddenDescriptions: ["24 岁的拿破仑"],
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("通过考研数学");
    expect(messages[1]?.content).toContain("极限");
    expect(messages[1]?.content).toContain("42");
    expect(messages[1]?.content).toContain("24 岁的拿破仑");
  });

  it("renders empty domain sample and forbidden list as placeholders, not crashing", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      domainLabelsSample: [],
      userMilestone: 0,
      forbiddenDescriptions: [],
    });
    expect(messages[1]?.content).toContain("（暂无样例）");
    expect(messages[1]?.content).toContain("（无）");
  });

  it("requires exactly 2 named-and-famous figures plus exactly 3 unnamed ordinary ones, each written as an interesting vignette", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      domainLabelsSample: [],
      userMilestone: 0,
      forbiddenDescriptions: [],
    });
    const systemPrompt = messages[0]?.content ?? "";
    expect(systemPrompt).toContain("恰好 2 位是有名有姓的真实名人");
    expect(systemPrompt).toContain("任何时代任何领域");
    expect(systemPrompt).toContain("恰好 3 位是无名的普通人");
    expect(systemPrompt).toContain("时代与身份不限");
    expect(systemPrompt).toContain("小说人物速写");
    expect(systemPrompt).toContain("会心一笑或出乎意料的具体细节");
  });
});

describe("validateLadderGeneration", () => {
  it("keeps all 5 figures, sorted by milestone desc with assigned positions", () => {
    const result: LadderGenerationResult = {
      figures: figures([
        ["a", 30],
        ["b", 50],
        ["c", 40],
        ["d", 60],
        ["e", 20],
      ]),
    };
    const validated = validateLadderGeneration(result, []);
    expect(validated?.map((figure) => figure.figureDesc)).toEqual(["d", "b", "c", "a", "e"]);
    expect(validated?.map((figure) => figure.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("drops a figure whose figureDesc is in the forbidden list", () => {
    const result: LadderGenerationResult = {
      figures: figures([
        ["a", 30],
        ["b", 50],
        ["c", 40],
        ["d", 60],
        ["e", 20],
      ]),
    };
    const validated = validateLadderGeneration(result, ["b"]);
    expect(validated?.map((figure) => figure.figureDesc)).not.toContain("b");
    expect(validated).toHaveLength(4);
  });

  it("dedupes figures that repeat the same milestone, keeping the first occurrence", () => {
    const result: LadderGenerationResult = {
      figures: figures([
        ["a", 30],
        ["b", 30],
        ["c", 40],
        ["d", 60],
        ["e", 20],
      ]),
    };
    const validated = validateLadderGeneration(result, []);
    expect(validated).toHaveLength(4);
    expect(validated?.some((figure) => figure.figureDesc === "a")).toBe(true);
    expect(validated?.some((figure) => figure.figureDesc === "b")).toBe(false);
  });

  it(`treats the whole generation as failed (null) once fewer than ${MIN_VALID_LADDER_FIGURES} figures survive`, () => {
    const result: LadderGenerationResult = {
      figures: figures([
        ["a", 30],
        ["b", 40],
        ["c", 50],
        ["d", 60],
        ["e", 70],
      ]),
    };
    // Forbid all but 2 -> below MIN_VALID_LADDER_FIGURES.
    const validated = validateLadderGeneration(result, ["a", "b", "c"]);
    expect(validated).toBeNull();
  });

  it("succeeds at exactly the minimum valid figure count", () => {
    const result: LadderGenerationResult = {
      figures: figures([
        ["a", 30],
        ["b", 40],
        ["c", 50],
        ["d", 60],
        ["e", 70],
      ]),
    };
    const validated = validateLadderGeneration(result, ["a", "b"]);
    expect(validated).toHaveLength(MIN_VALID_LADDER_FIGURES);
  });
});
