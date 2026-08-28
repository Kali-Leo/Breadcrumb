/**
 * Purpose: unit tests for the verdict contract — schema boundaries, citation-index range
 * checking, and evidence formatting in the prompt.
 */
import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "./evidence/provider";
import { buildVerdictMessages, createVerdictSchema } from "./verdict";

const EVIDENCE: EvidenceItem[] = [
  {
    url: "https://zh.wikipedia.org/wiki/光速",
    title: "光速",
    snippet: "光速是每秒 299792458 米。",
    source: "wikipedia",
  },
];

describe("createVerdictSchema", () => {
  const schema = createVerdictSchema(2);

  it("accepts the three relationships", () => {
    for (const relationship of ["supported", "contradicted", "insufficient"] as const) {
      expect(
        schema.parse({ reasoning: "资料显示一致。", relationship, supportingEvidence: [1] })
          .relationship,
      ).toBe(relationship);
    }
  });

  it("rejects unknown relationships", () => {
    expect(() => schema.parse({ reasoning: "x", relationship: "maybe" })).toThrow();
  });

  it("defaults supportingEvidence to an empty list rather than failing the verdict", () => {
    const parsed = schema.parse({ reasoning: "资料不足。", relationship: "insufficient" });
    expect(parsed.supportingEvidence).toEqual([]);
  });

  it("rejects a citation index outside the evidence actually given to the judge", () => {
    expect(() =>
      schema.parse({ reasoning: "x", relationship: "supported", supportingEvidence: [3] }),
    ).toThrow();
    expect(() =>
      schema.parse({ reasoning: "x", relationship: "supported", supportingEvidence: [0] }),
    ).toThrow();
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

  it("asks the judge which evidence carried the conclusion", () => {
    const messages = buildVerdictMessages("任意声明", EVIDENCE);
    expect(messages[0]?.content ?? "").toContain("supportingEvidence");
  });
});
