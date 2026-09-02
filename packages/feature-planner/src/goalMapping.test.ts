/**
 * Purpose: unit tests for the goal-mapping prompt builder and its response schema.
 */
import { describe, expect, it } from "vitest";
import { buildGoalMappingMessages, goalMappingSchema } from "./goalMapping";

describe("buildGoalMappingMessages", () => {
  it("includes every existing node label and the goal text", () => {
    const messages = buildGoalMappingMessages("通过考研数学", ["导数", "闭包"]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("导数");
    expect(messages[1]?.content).toContain("闭包");
    expect(messages[1]?.content).toContain("通过考研数学");
  });

  it("renders an explicit empty-tree marker when there are no existing nodes", () => {
    const messages = buildGoalMappingMessages("通过考研数学", []);
    expect(messages[1]?.content).toContain("空树");
  });

  it("explains what a hard prerequisite is and scopes requires to this mapping's own labels", () => {
    // Without prerequisite edges a brand-new goal's gap has no structure at all, so the
    // "recommended route" is decided by localeCompare (2026-08-28 audit, planning gap 1).
    const systemContent = buildGoalMappingMessages("通过考研数学", ["导数"])[0]?.content ?? "";
    expect(systemContent).toContain("requires 是硬前置");
    expect(systemContent).toContain("必须是本次 existing 或 suggested 里出现过的名字");
    expect(systemContent).toContain("宁缺毋滥");
  });
});

describe("goalMappingSchema", () => {
  it("accepts a well-formed response with both existing and suggested nodes", () => {
    const result = goalMappingSchema.parse({
      existing: ["导数"],
      suggested: [{ label: "多元函数微分", summary: "多变量函数的微分学" }],
    });
    expect(result.existing).toEqual(["导数"]);
    expect(result.suggested).toHaveLength(1);
  });

  it("accepts empty arrays on both sides", () => {
    const result = goalMappingSchema.parse({ existing: [], suggested: [] });
    expect(result.existing).toEqual([]);
    expect(result.suggested).toEqual([]);
  });

  it("rejects more than 15 suggested nodes", () => {
    const one = { label: "x", summary: "s" };
    expect(() =>
      goalMappingSchema.parse({ existing: [], suggested: Array(16).fill(one) }),
    ).toThrow();
  });

  it("rejects a suggested node missing a summary", () => {
    expect(() => goalMappingSchema.parse({ existing: [], suggested: [{ label: "x" }] })).toThrow();
  });

  it("accepts a suggested node carrying prerequisite labels", () => {
    const result = goalMappingSchema.parse({
      existing: ["导数"],
      suggested: [{ label: "多元函数微分", summary: "多变量函数的微分学", requires: ["导数"] }],
    });
    expect(result.suggested[0]?.requires).toEqual(["导数"]);
  });

  it("leaves requires undefined when the model omits it", () => {
    const result = goalMappingSchema.parse({
      existing: [],
      suggested: [{ label: "重积分", summary: "多重积分" }],
    });
    expect(result.suggested[0]?.requires).toBeUndefined();
  });

  it("rejects a non-string requires entry", () => {
    expect(() =>
      goalMappingSchema.parse({
        existing: [],
        suggested: [{ label: "重积分", summary: "多重积分", requires: [7] }],
      }),
    ).toThrow();
  });
});
