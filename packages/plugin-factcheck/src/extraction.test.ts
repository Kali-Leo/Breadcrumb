/**
 * Purpose: unit tests for the claim-extraction contract — schema boundaries and
 * prompt message construction.
 */
import { describe, expect, it } from "vitest";
import { buildClaimExtractionMessages, claimExtractionSchema } from "./extraction";

describe("claimExtractionSchema", () => {
  it("accepts an empty claim list", () => {
    expect(claimExtractionSchema.parse({ claims: [] }).claims).toEqual([]);
  });

  it("accepts claims with 1-2 queries", () => {
    const parsed = claimExtractionSchema.parse({
      claims: [{ text: "光速约为每秒 30 万公里", queries: ["光速 数值", "speed of light"] }],
    });
    expect(parsed.claims).toHaveLength(1);
  });

  it("rejects a claim without queries", () => {
    expect(() =>
      claimExtractionSchema.parse({ claims: [{ text: "光速很快", queries: [] }] }),
    ).toThrow();
  });

  it("rejects more than 4 claims", () => {
    const claim = { text: "某个事实", queries: ["查询"] };
    expect(() =>
      claimExtractionSchema.parse({ claims: [claim, claim, claim, claim, claim] }),
    ).toThrow();
  });
});

describe("buildClaimExtractionMessages", () => {
  it("embeds both question and answer in the user message", () => {
    const messages = buildClaimExtractionMessages("什么是光速？", "光速约为每秒 30 万公里。");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("什么是光速？");
    expect(messages[1]?.content).toContain("光速约为每秒 30 万公里。");
  });
});
