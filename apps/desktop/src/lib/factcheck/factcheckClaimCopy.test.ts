/**
 * Purpose: unit tests for the fallback sentence under a checked claim — the three outcomes
 * the pipeline decides by itself each resolve to their own catalogue key, a judge's own
 * reasoning is left alone, and rows stored before the split keep their original text.
 */
import { describe, expect, it } from "vitest";
import { resources } from "../../i18n";
import { claimReasoningKey } from "./factcheckClaimCopy";

describe("claimReasoningKey", () => {
  it("names the search-never-got-out sentence for an unavailable claim", () => {
    expect(
      claimReasoningKey({ relationship: "unavailable", reasoning: "", evidenceCount: 0 }),
    ).toBe("factcheck.unavailableNextStep");
  });

  it("distinguishes 'found nothing' from 'the judging call failed' by the evidence in hand", () => {
    expect(
      claimReasoningKey({ relationship: "insufficient", reasoning: "", evidenceCount: 0 }),
    ).toBe("factcheck.noEvidenceReasoning");
    expect(
      claimReasoningKey({ relationship: "insufficient", reasoning: "", evidenceCount: 3 }),
    ).toBe("factcheck.verdictFailedReasoning");
  });

  it("leaves a judge's own reasoning alone", () => {
    expect(
      claimReasoningKey({
        relationship: "supported",
        reasoning: "资料显示数值一致。",
        evidenceCount: 2,
      }),
    ).toBeNull();
  });

  it("keeps showing the text of rows stored before the wording moved to the catalogue", () => {
    // Old rows hold a Chinese sentence written by the package; they are displayed as-is
    // rather than migrated, so a fallback must not override them.
    expect(
      claimReasoningKey({
        relationship: "insufficient",
        reasoning: "我没有找到能佐证这一条的公开资料，值得再确认一下。",
        evidenceCount: 0,
      }),
    ).toBeNull();
  });

  it("resolves every key it can name to a real sentence in both catalogues", () => {
    const keys = [
      claimReasoningKey({ relationship: "unavailable", reasoning: "", evidenceCount: 0 }),
      claimReasoningKey({ relationship: "insufficient", reasoning: "", evidenceCount: 0 }),
      claimReasoningKey({ relationship: "insufficient", reasoning: "", evidenceCount: 1 }),
    ];
    for (const language of ["zh-CN", "en"] as const) {
      const chat = resources[language]?.chat as Record<string, Record<string, unknown>>;
      for (const key of keys) {
        const leaf = key?.split(".")[1] as string;
        expect(typeof chat.factcheck?.[leaf], `${language} ${key}`).toBe("string");
      }
    }
  });
});
