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
});
