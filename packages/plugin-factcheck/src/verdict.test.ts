/**
 * Purpose: unit tests for the verdict contract — schema boundaries and evidence
 * formatting in the prompt.
 */
import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "./evidence/provider";
import { buildVerdictMessages, verdictSchema } from "./verdict";

const EVIDENCE: EvidenceItem[] = [
  {
    url: "https://zh.wikipedia.org/wiki/光速",
    title: "光速",
    snippet: "光速是每秒 299792458 米。",
    source: "wikipedia",
  },
];

describe("verdictSchema", () => {
  it("accepts the three relationships", () => {
    for (const relationship of ["supported", "contradicted", "insufficient"] as const) {
      expect(verdictSchema.parse({ reasoning: "资料显示一致。", relationship }).relationship).toBe(
        relationship,
      );
    }
  });

  it("rejects unknown relationships", () => {
    expect(() => verdictSchema.parse({ reasoning: "x", relationship: "maybe" })).toThrow();
  });
});

describe("buildVerdictMessages", () => {
  it("numbers evidence and includes claim, url and snippet", () => {
    const messages = buildVerdictMessages("光速约为每秒 30 万公里", EVIDENCE);
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("声明：光速约为每秒 30 万公里");
    expect(userContent).toContain("[1]");
    expect(userContent).toContain("https://zh.wikipedia.org/wiki/光速");
    expect(userContent).toContain("光速是每秒 299792458 米。");
  });
});
