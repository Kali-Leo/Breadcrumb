/**
 * Purpose: unit tests for the ranked-ladder persona generation LLM contract (spec 020) —
 * prompt construction from the learner's concrete knowledge state, the all-deceased-famous
 * rules, validateLadderGeneration's AI-reveal tripwire, within-batch identity dedup, and
 * minimum-valid-figures failure.
 */
import { describe, expect, it } from "vitest";
import {
  buildLadderGenerationMessages,
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
    chatProfile: { personality: "果断", activeHours: "清晨活跃", replyStyle: "简短命令式" },
    ...overrides,
  };
}

function resultOf(figures: LadderFigureProposal[]): LadderGenerationResult {
  return { figures };
}

describe("buildLadderGenerationMessages", () => {
  it("embeds the goal title and the learner's concrete knowledge state with freshness", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "通过考研数学",
      learnedItems: [
        { label: "极限", freshness: "熟" },
        { label: "导数", freshness: "有点生疏" },
      ],
      notYetLabels: ["级数"],
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("通过考研数学");
    expect(messages[1]?.content).toContain("- 极限（熟）");
    expect(messages[1]?.content).toContain("- 导数（有点生疏）");
    expect(messages[1]?.content).toContain("- 级数");
  });

  it("renders empty knowledge lists as placeholders, not crashing", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      learnedItems: [],
      notYetLabels: [],
    });
    expect(messages[1]?.content).toContain("（还没接触过任何知识点）");
    expect(messages[1]?.content).toContain("（暂无）");
  });

  it("states the all-deceased-famous rules, concrete matching and the selfLine method — with no percentage or progress language", () => {
    const messages = buildLadderGenerationMessages({
      goalTitle: "x",
      learnedItems: [],
      notYetLabels: [],
    });
    const systemPrompt = messages[0]?.content ?? "";
    expect(systemPrompt).toContain("全部必须是已经去世的真实名人");
    expect(systemPrompt).toContain("不必与这个知识范围同领域");
    expect(systemPrompt).toContain("巅峰年龄");
    expect(systemPrompt).toContain("真实姓名");
    expect(systemPrompt).toContain("略多一点");
    expect(systemPrompt).toContain("略少一点");
    expect(systemPrompt).toContain("如果一定要这个人写一个主页签名，以他的性格，他会写什么");
    // The rank number is a pure incentive — no completion semantics may leak into generation.
    expect(systemPrompt).not.toMatch(/[%％]|百分|进度|掌握比/);
    // The AI-reveal tripwire is deliberately a code-level check, never prompt-stuffed.
    expect(systemPrompt).not.toMatch(/不(要|能|得|可).{0,6}(AI|生成|模拟)/);
    expect(systemPrompt).not.toContain("禁止");
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
    const validated = validateLadderGeneration(result);
    expect(validated?.map((f) => f.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(validated?.map((f) => f.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("dedupes figures that repeat the same name+era within the batch, keeping the first", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", selfLine: "first" }),
      figure({ name: "a", era: "e1", selfLine: "second" }),
      figure({ name: "b", era: "e2" }),
      figure({ name: "c", era: "e3" }),
    ]);
    const validated = validateLadderGeneration(result);
    expect(validated).toHaveLength(3);
    expect(validated?.find((f) => f.name === "a")?.selfLine).toBe("first");
  });

  it("allows the same person at a different era/age — that is a different description", () => {
    const result = resultOf([
      figure({ name: "拿破仑", era: "18世纪末", age: 24 }),
      figure({ name: "拿破仑", era: "19世纪初", age: 40 }),
      figure({ name: "b", era: "e2" }),
    ]);
    const validated = validateLadderGeneration(result);
    expect(validated).toHaveLength(3);
  });

  it("drops any figure whose selfLine trips the AI-reveal tripwire", () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", selfLine: "这是AI生成的一句话" }),
      figure({ name: "b", era: "e2", selfLine: "只是模拟一下考试心情" }),
      figure({ name: "c", era: "e3", selfLine: "正常的一句话" }),
      figure({ name: "d", era: "e4", selfLine: "另一句正常的话" }),
      figure({ name: "e", era: "e5", selfLine: "再一句正常的话" }),
    ]);
    const validated = validateLadderGeneration(result);
    expect(validated?.map((f) => f.name)).toEqual(["c", "d", "e"]);
  });

  it(`treats the whole generation as failed (null) once fewer than ${MIN_VALID_LADDER_FIGURES} figures survive`, () => {
    const result = resultOf([
      figure({ name: "a", era: "e1", selfLine: "AI在此" }),
      figure({ name: "b", era: "e2", selfLine: "全是模拟" }),
      figure({ name: "c", era: "e3", selfLine: "生成中" }),
      figure({ name: "d", era: "e4" }),
      figure({ name: "e", era: "e5" }),
    ]);
    expect(validateLadderGeneration(result)).toBeNull();
  });
});
