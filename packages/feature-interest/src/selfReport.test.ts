/**
 * Purpose: unit tests for the self-report mapping prompt builder and its response schema.
 */
import { describe, expect, it } from "vitest";
import { buildSelfReportMessages, selfReportMappingSchema } from "./selfReport";

describe("buildSelfReportMessages", () => {
  it("includes every existing node label and the user's free text", () => {
    const messages = buildSelfReportMessages("我学过高中数学", ["导数", "闭包"]);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("导数");
    expect(messages[1]?.content).toContain("闭包");
    expect(messages[1]?.content).toContain("我学过高中数学");
  });

  it("renders an explicit empty-tree marker when there are no existing nodes", () => {
    const messages = buildSelfReportMessages("我学过高中数学", []);
    expect(messages[1]?.content).toContain("空树");
  });
});

describe("selfReportMappingSchema", () => {
  it("accepts a well-formed response", () => {
    const result = selfReportMappingSchema.parse({
      mappings: [{ label: "导数", claimLevel: "learned" }],
    });
    expect(result.mappings).toHaveLength(1);
  });

  it("accepts an empty mapping list", () => {
    expect(selfReportMappingSchema.parse({ mappings: [] }).mappings).toEqual([]);
  });

  it("rejects an invalid claim level", () => {
    expect(() =>
      selfReportMappingSchema.parse({ mappings: [{ label: "导数", claimLevel: "expert" }] }),
    ).toThrow();
  });
});
