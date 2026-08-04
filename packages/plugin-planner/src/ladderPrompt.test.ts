/**
 * Purpose: unit tests for the ranked-ladder persona generation LLM contract — prompt
 * construction (domain sample, forbidden identity list), validateLadderGeneration's
 * AI-reveal tripwire, forbidden/within-batch identity dedup, and minimum-valid-figures
 * failure.
 */
import { describe, expect, it } from "vitest";
import {
  buildLadderGenerationMessages,
  figureIdentity,
  type LadderFigureProposal,
  type LadderGenerationResult,
  MIN_VALID_LADDER_FIGURES,
  validateLadderGeneration,
} from "./ladderPrompt";

function figure(overrides: Partial<LadderFigureProposal> = {}): LadderFigureProposal {
  return {
    name: "拿破仑",
    age: 24,
    era: "18世纪末",
    occupation: "军官",
    selfLine: "土伦港的炮位还记得我",
    isFamous: "名人",
    chatProfile: { personality: "果断", activeHours: "清晨活跃", replyStyle: "简短命令式" },
    ...overrides,
  };
}

function resultOf(figures: LadderFigureProposal[]): LadderGenerationResult {
  return { figures };
}

describe("buildLadderGenerationMessages", () => {
  it("embeds the goal title, domain sample and forbidden identity list", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "通过考研数学",
      domainLabelsSample: ["极限", "导数"],
      forbiddenIdentities: ["拿破仑|18世纪末"],
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("通过考研数学");
    expect(messages[1]?.content).toContain("极限");
    expect(messages[1]?.content).toContain("拿破仑|18世纪末");
  });

  it("renders empty domain sample and forbidden list as placeholders, not crashing", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      domainLabelsSample: [],
      forbiddenIdentities: [],
    });
    expect(messages[1]?.content).toContain("（暂无样例）");
    expect(messages[1]?.content).toContain("（无）");
  });

  it("asks for 2 named figures plus 3 ordinary people, each described only in-character", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      domainLabelsSample: [],
      forbiddenIdentities: [],
    });
    const systemPrompt = messages[0]?.content ?? "";
    expect(systemPrompt).toContain("2 位真实存在过的名人");
    expect(systemPrompt).toContain("3 位虚构的普通人");
    expect(systemPrompt).toContain("把名字留在悬念里");
    expect(systemPrompt).toContain("生活气");
    // The AI-reveal tripwire is deliberately a code-level check, never prompt-stuffed: the
    // prompt must never instruct the model about hiding/avoiding "AI/生成/模拟" wording.
    expect(systemPrompt).not.toMatch(/不(要|能|得|可).{0,6}(AI|生成|模拟)/);
    expect(systemPrompt).not.toContain("禁止");
  });
});

describe("figureIdentity", () => {
  it("joins name and era with a pipe", () => {
    expect(figureIdentity({ name: "拿破仑", era: "18世纪末" })).toBe("拿破仑|18世纪末");
  });
});

describe("validateLadderGeneration", () => {
  it("keeps all 5 figures in original batch order with assigned positions", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
      figure({ name: "d", era: "e4" }),
      figure({ name: "e", era: "e5" }),
    ]);
    const validated = validateLadderGeneration(result, []);
    expect(validated?.map((f) => f.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(validated?.map((f) => f.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("maps isFamous from the Chinese enum to a boolean", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", isFamous: "名人" }),
      figure({ name: "b", era: "e2", isFamous: "普通人" }),
      figure({ name: "c", era: "e3", isFamous: "普通人" }),
    ]);
    const validated = validateLadderGeneration(result, []);
    expect(validated?.find((f) => f.name === "a")?.isFamous).toBe(true);
    expect(validated?.find((f) => f.name === "b")?.isFamous).toBe(false);
  });

  it("drops a figure whose identity is in the forbidden list", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
      figure({ name: "d", era: "e4" }),
    ]);
    const validated = validateLadderGeneration(result, ["b|e2"]);
    expect(validated?.map((f) => f.name)).not.toContain("b");
    expect(validated).toHaveLength(3);
  });

  it("dedupes figures that repeat the same name+era within the batch, keeping the first", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", selfLine: "first" }),
      figure({ name: "a", era: "e1", selfLine: "second" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
    ]);
    const validated = validateLadderGeneration(result, []);
    expect(validated).toHaveLength(3);
    expect(validated?.find((f) => f.name === "a")?.selfLine).toBe("first");
  });

  it("drops any figure whose selfLine trips the AI-reveal tripwire", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", selfLine: "这是AI生成的一句话" }),
      figure({ name: "b", era: "e2", selfLine: "只是模拟一下考试心情" }),
      figure({ name: "c", era: "e3", selfLine: "正常的一句话" }),
      figure({ name: "d", era: "e4", selfLine: "另一句正常的话" }),
      figure({ name: "e", era: "e5", selfLine: "再一句正常的话" }),
    ]);
    const validated = validateLadderGeneration(result, []);
    expect(validated?.map((f) => f.name)).toEqual(["c", "d", "e"]);
  });

  it(`treats the whole generation as failed (null) once fewer than ${MIN_VALID_LADDER_FIGURES} figures survive`, () => {
    const result = resultOf([
      figure({ name: "a", era: "e1" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
      figure({ name: "d", era: "e4" }),
      figure({ name: "e", era: "e5" }),
    ]);
    // Forbid all but 2 -> below MIN_VALID_LADDER_FIGURES.
    const validated = validateLadderGeneration(result, ["a|e1", "b|e2", "c|e3"]);
    expect(validated).toBeNull();
  });

  it("succeeds at exactly the minimum valid figure count", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
      figure({ name: "d", era: "e4" }),
      figure({ name: "e", era: "e5" }),
    ]);
    const validated = validateLadderGeneration(result, ["a|e1", "b|e2"]);
    expect(validated).toHaveLength(MIN_VALID_LADDER_FIGURES);
  });
});
