/**
 * Purpose: unit tests for the edge-judge contract — schema boundaries for valid and invalid
 * LLM output, and prompt message construction.
 */
import { describe, expect, it } from "vitest";
import { buildEdgeJudgeMessages, edgeJudgeSchema, HELPS_WEIGHT_SCORES } from "./edgeJudge";

describe("edgeJudgeSchema", () => {
  it("accepts an empty response", () => {
    const parsed = edgeJudgeSchema.parse({ edges: [], methodNodes: [] });
    expect(parsed.edges).toEqual([]);
    expect(parsed.methodNodes).toEqual([]);
  });

  it("accepts a requires judgment with weight null", () => {
    const parsed = edgeJudgeSchema.parse({
      edges: [
        {
          pairId: "p0",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "不学极限就学不懂导数",
        },
      ],
      methodNodes: [],
    });
    expect(parsed.edges[0]?.relation).toBe("requires");
  });

  it("accepts a helps judgment with a weight tier", () => {
    const parsed = edgeJudgeSchema.parse({
      edges: [
        {
          pairId: "p1",
          relation: "helps",
          direction: null,
          weight: "中",
          confidence: 0.7,
          reasoning: "类比有助于理解",
        },
      ],
      methodNodes: [],
    });
    expect(parsed.edges[0]?.weight).toBe("中");
  });

  it("accepts a method node proposal", () => {
    const parsed = edgeJudgeSchema.parse({
      edges: [],
      methodNodes: [
        {
          label: "费曼技巧",
          summary: "用简单语言复述以检验理解",
          helpsLabels: ["导数"],
          weight: "强",
          confidence: 0.7,
        },
      ],
    });
    expect(parsed.methodNodes[0]?.label).toBe("费曼技巧");
  });

  it("rejects a non-tier weight value", () => {
    expect(() =>
      edgeJudgeSchema.parse({
        edges: [
          {
            pairId: "p0",
            relation: "helps",
            direction: null,
            weight: 0.6,
            confidence: 0.5,
            reasoning: "x",
          },
        ],
        methodNodes: [],
      }),
    ).toThrow();
  });

  it("maps every anchored helps-weight tier to its documented number", () => {
    expect(HELPS_WEIGHT_SCORES).toEqual({ 弱: 0.3, 中: 0.6, 强: 0.9 });
  });

  it("rejects an unknown relation value", () => {
    expect(() =>
      edgeJudgeSchema.parse({
        edges: [
          {
            pairId: "p0",
            relation: "opposes",
            direction: null,
            weight: null,
            confidence: 0.5,
            reasoning: "x",
          },
        ],
        methodNodes: [],
      }),
    ).toThrow();
  });

  it("rejects a method node with no helpsLabels", () => {
    expect(() =>
      edgeJudgeSchema.parse({
        edges: [],
        methodNodes: [
          { label: "费曼技巧", summary: "s", helpsLabels: [], weight: 0.5, confidence: 0.5 },
        ],
      }),
    ).toThrow();
  });

  it("defaults adjacentConcepts to an empty array when the key is omitted (ranked mode)", () => {
    const parsed = edgeJudgeSchema.parse({ edges: [], methodNodes: [] });
    expect(parsed.adjacentConcepts).toEqual([]);
  });

  it("accepts an adjacent-concept proposal with an anchored helpsLevel tier", () => {
    const parsed = edgeJudgeSchema.parse({
      edges: [],
      methodNodes: [],
      adjacentConcepts: [
        {
          label: "拉格朗日乘数法",
          summary: "带约束的极值问题求解方法",
          connectsToLabel: "导数",
          helpsLevel: "中",
        },
      ],
    });
    expect(parsed.adjacentConcepts[0]?.helpsLevel).toBe("中");
  });

  it("rejects more than 2 adjacentConcepts", () => {
    const proposal = {
      label: "x",
      summary: "s",
      connectsToLabel: "y",
      helpsLevel: "弱" as const,
    };
    expect(() =>
      edgeJudgeSchema.parse({
        edges: [],
        methodNodes: [],
        adjacentConcepts: [proposal, proposal, proposal],
      }),
    ).toThrow();
  });

  it("rejects more than 20 edges", () => {
    const edge = {
      pairId: "p0",
      relation: "unrelated" as const,
      direction: null,
      weight: null,
      confidence: 0.5,
      reasoning: "x",
    };
    expect(() => edgeJudgeSchema.parse({ edges: Array(21).fill(edge), methodNodes: [] })).toThrow();
  });
});

describe("buildEdgeJudgeMessages", () => {
  it("embeds both nodes of every pair with their pairId in the user message", () => {
    const messages = buildEdgeJudgeMessages([
      {
        pairId: "p0",
        nodeALabel: "极限",
        nodeASummary: "函数趋近某值的行为",
        nodeBLabel: "导数",
        nodeBSummary: "瞬时变化率",
      },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("p0");
    expect(messages[1]?.content).toContain("极限");
    expect(messages[1]?.content).toContain("导数");
  });

  it("lists multiple pairs on separate lines", () => {
    const messages = buildEdgeJudgeMessages([
      { pairId: "p0", nodeALabel: "A", nodeASummary: "a", nodeBLabel: "B", nodeBSummary: "b" },
      { pairId: "p1", nodeALabel: "C", nodeASummary: "c", nodeBLabel: "D", nodeBSummary: "d" },
    ]);
    const content = messages[1]?.content ?? "";
    // One header line ("候选知识点对：") plus one line per pair.
    expect(content.split("\n")).toHaveLength(3);
    expect(content).toContain("p0");
    expect(content).toContain("p1");
  });

  it("omits the adjacent-concept section by default (ranked mode)", () => {
    const messages = buildEdgeJudgeMessages([
      { pairId: "p0", nodeALabel: "A", nodeASummary: "a", nodeBLabel: "B", nodeBSummary: "b" },
    ]);
    expect(messages[0]?.content).not.toContain("adjacentConcepts");
  });

  it("includes the adjacent-concept section only when casual is true", () => {
    const messages = buildEdgeJudgeMessages(
      [{ pairId: "p0", nodeALabel: "A", nodeASummary: "a", nodeBLabel: "B", nodeBSummary: "b" }],
      { casual: true },
    );
    expect(messages[0]?.content).toContain("adjacentConcepts");
  });
});
