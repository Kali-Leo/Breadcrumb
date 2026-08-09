/**
 * Purpose: unit tests for the ladder assessment contract (spec 022) — schema shape, prompt
 * carrying the concrete knowledge lists, the tripwire/no-digits/distinctness validation, and
 * the domain closure helper.
 */
import { describe, expect, it } from "vitest";
import {
  buildLadderAssessmentMessages,
  goalDomainClosure,
  ladderAssessmentSchema,
  validateLadderAssessment,
} from "./ladderAssessment";

const VALID = {
  aboveTitle: "闭包和原型链都摸熟了的人",
  selfTitle: "刚点亮闭包，原型链还没碰",
  belowTitle: "还在作用域链门口打转",
};

describe("ladderAssessmentSchema", () => {
  it("accepts three plain titles", () => {
    expect(ladderAssessmentSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects missing or out-of-length titles", () => {
    expect(ladderAssessmentSchema.safeParse({ ...VALID, selfTitle: "" }).success).toBe(false);
    expect(
      ladderAssessmentSchema.safeParse({ ...VALID, aboveTitle: "长".repeat(31) }).success,
    ).toBe(false);
    expect(
      ladderAssessmentSchema.safeParse({ aboveTitle: VALID.aboveTitle, selfTitle: VALID.selfTitle })
        .success,
    ).toBe(false);
  });
});

describe("buildLadderAssessmentMessages", () => {
  it("carries the goal title, learned items with freshness, and not-yet samples", () => {
    const messages = buildLadderAssessmentMessages({
      goalTitle: "学微积分",
      learnedItems: [
        { label: "极限", freshness: "熟" },
        { label: "导数", freshness: "刚学会" },
      ],
      notYetLabels: ["积分", "级数"],
    });
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toContain("学微积分");
    expect(user?.content).toContain("极限（熟）");
    expect(user?.content).toContain("导数（刚学会）");
    expect(user?.content).toContain("- 积分");
    expect(user?.content).toContain("- 级数");
  });

  it("states an empty knowledge list plainly instead of omitting it", () => {
    const messages = buildLadderAssessmentMessages({
      goalTitle: "学微积分",
      learnedItems: [],
      notYetLabels: [],
    });
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toContain("还没有接触过");
  });

  it("never leaks the tripwire words into the prompt", () => {
    const messages = buildLadderAssessmentMessages({
      goalTitle: "学微积分",
      learnedItems: [{ label: "极限", freshness: "熟" }],
      notYetLabels: [],
    });
    for (const message of messages) {
      expect(message.content).not.toMatch(/模拟/);
    }
  });
});

describe("validateLadderAssessment", () => {
  it("passes a clean assessment through unchanged", () => {
    expect(validateLadderAssessment(VALID)).toEqual(VALID);
  });

  it("rejects the AI-reveal tripwire words", () => {
    for (const bad of ["AI 概括的状态", "生成的称号", "模拟出来的人"]) {
      expect(validateLadderAssessment({ ...VALID, selfTitle: bad })).toBeNull();
    }
  });

  it("rejects digits and percents (a metric smuggled back in)", () => {
    for (const bad of ["会 80% 的闭包", "第3档的人", "掌握９成"]) {
      expect(validateLadderAssessment({ ...VALID, aboveTitle: bad })).toBeNull();
    }
  });

  it("rejects duplicate titles", () => {
    expect(validateLadderAssessment({ ...VALID, belowTitle: VALID.selfTitle })).toBeNull();
  });
});

describe("goalDomainClosure", () => {
  it("includes the goal nodes themselves plus their requires-prerequisites", () => {
    const edges = [
      {
        id: "e1",
        source_id: "prereq",
        target_id: "goal-node",
        edge_type: "requires" as const,
        weight: 1,
        confidence: 0.9,
        origin: "user" as const,
        created_at: "2026-08-09T00:00:00Z",
      },
    ];
    const closure = goalDomainClosure(edges, ["goal-node"]);
    expect(closure).toContain("goal-node");
    expect(closure).toContain("prereq");
  });
});
