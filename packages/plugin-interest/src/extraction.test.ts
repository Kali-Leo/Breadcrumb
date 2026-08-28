/**
 * Purpose: unit tests for the interest-extraction prompt builder and its response schema.
 */
import { describe, expect, it } from "vitest";
import {
  buildInterestMessages,
  CONFIDENCE_LEVEL_SCORES,
  INTEREST_LEVEL_SCORES,
  interestSignalsSchema,
} from "./extraction";

describe("buildInterestMessages", () => {
  it("echoes every given node's label into the prompt", () => {
    const messages = buildInterestMessages(
      [
        { nodeId: "n1", label: "闭包" },
        { nodeId: "n2", label: "递归" },
      ],
      "闭包是什么？",
      "闭包是……",
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("闭包");
    expect(messages[1]?.content).toContain("递归");
    expect(messages[1]?.content).toContain("闭包是什么？");
  });

  it("requires content-level evidence before a mid/high boredom read, and never treats brevity as one", () => {
    // The constitution's one red line is 永不评判用户. The prompt used to hand "懂了懂了" /
    // "行吧行吧" / "知道了知道了" straight to the strongest boredom tier, which reads an ADHD
    // learner's or an ordinary Chinese speaker's acknowledgement token as contempt for the
    // material (2026-08-28 audit, interest gap 4). Boredom now needs something the learner
    // actually said about the topic.
    const messages = buildInterestMessages([{ nodeId: "n1", label: "闭包" }], "问", "答");
    const systemContent = messages[0]?.content ?? "";
    expect(systemContent).toContain("明确说要跳过");
    expect(systemContent).toContain("反复表达不耐烦");
    expect(systemContent).toContain("主动把话题转到别处");
    expect(systemContent).toContain("回复简短本身不是证据");
    for (const acknowledgement of ["懂了懂了", "行吧行吧", "知道了知道了", "直接来例子"]) {
      expect(systemContent).not.toContain(acknowledgement);
    }
  });

  it("names the ASCII tier values and tells the model not to translate them", () => {
    // jsonClient appends an answer-language directive to every call, so a Chinese tier literal
    // makes an English-locale model answer "none"/"weak" into a schema that only accepts
    // 无/弱 — Zod fails, the retry fails the same way, and interest extraction goes silently
    // dark (2026-08-28 audit, 多语言 B6).
    const systemContent =
      buildInterestMessages([{ nodeId: "n1", label: "闭包" }], "问", "答")[0]?.content ?? "";
    expect(systemContent).toContain("none|weak|medium|strong");
    expect(systemContent).toContain("low|medium|high");
    expect(systemContent).toContain("不要翻译成中文或其他语言");
    // No tier value in the contract line may be a non-ASCII literal.
    const contractLine = systemContent.split("\n").find((line) => line.includes('"signals"')) ?? "";
    for (const tier of ["无", "弱", "中", "强", "低", "高"]) {
      expect(contractLine).not.toContain(`"${tier}`);
    }
  });
});

describe("interestSignalsSchema", () => {
  it("accepts a well-formed response", () => {
    const result = interestSignalsSchema.parse({
      signals: [
        {
          label: "闭包",
          curiosity: "strong",
          confusion: "weak",
          boredom: "none",
          confidence: "high",
          styles: ["类比"],
        },
      ],
    });
    expect(result.signals).toHaveLength(1);
  });

  it("accepts an empty signal list", () => {
    expect(interestSignalsSchema.parse({ signals: [] }).signals).toEqual([]);
  });

  it("rejects a non-tier dimension value", () => {
    expect(() =>
      interestSignalsSchema.parse({
        signals: [
          {
            label: "闭包",
            curiosity: 0.8,
            confusion: "none",
            boredom: "none",
            confidence: "medium",
            styles: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a non-tier confidence value", () => {
    expect(() =>
      interestSignalsSchema.parse({
        signals: [
          {
            label: "闭包",
            curiosity: "none",
            confusion: "none",
            boredom: "none",
            confidence: 0.5,
            styles: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects the old Chinese tier literals, so a stale prompt cannot half-work", () => {
    expect(() =>
      interestSignalsSchema.parse({
        signals: [
          {
            label: "闭包",
            curiosity: "强",
            confusion: "无",
            boredom: "无",
            confidence: "高",
            styles: [],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("INTEREST_LEVEL_SCORES / CONFIDENCE_LEVEL_SCORES", () => {
  it("maps every anchored tier to its documented number", () => {
    expect(INTEREST_LEVEL_SCORES).toEqual({ none: 0, weak: 0.3, medium: 0.6, strong: 0.9 });
    expect(CONFIDENCE_LEVEL_SCORES).toEqual({ low: 0.3, medium: 0.6, high: 0.9 });
  });

  it("keys every tier with an ASCII-only value (多语言 B6)", () => {
    const keys = [...Object.keys(INTEREST_LEVEL_SCORES), ...Object.keys(CONFIDENCE_LEVEL_SCORES)];
    for (const key of keys) {
      expect(key).toMatch(/^[a-z]+$/);
    }
  });
});
