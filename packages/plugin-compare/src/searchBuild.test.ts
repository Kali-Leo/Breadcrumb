/**
 * Purpose: unit tests for the search-build contract (spec 023 §5) — proposal schema,
 * evidence-token checks, unverified-branch pruning (whole subtree gone), and the
 * whole-build failure threshold.
 */
import { describe, expect, it } from "vitest";
import {
  buildCompareProposalMessages,
  pruneUnverifiedBranches,
  type SearchedProposalItem,
  searchedProfileProposalSchema,
  significantTokens,
  survivesThreshold,
  verifyEvidenceText,
} from "./searchBuild";

function proposalItem(overrides: Partial<SearchedProposalItem>): SearchedProposalItem {
  return {
    key: "k",
    parentKey: null,
    label: "条目",
    aliases: [],
    sourceTitle: "某官方课程标准",
    sourceUrl: "https://example.org/standard",
    ...overrides,
  };
}

describe("searchedProfileProposalSchema", () => {
  it("requires a source title and URL on every item", () => {
    const good = {
      title: "数据分析师",
      description: "依据某官方标准",
      items: [
        proposalItem({ key: "a" }),
        proposalItem({ key: "b" }),
        proposalItem({ key: "c" }),
        proposalItem({ key: "d" }),
      ],
    };
    expect(searchedProfileProposalSchema.safeParse(good).success).toBe(true);
    const bad = {
      ...good,
      items: [...good.items.slice(0, 3), proposalItem({ key: "d", sourceUrl: "not-a-url" })],
    };
    expect(searchedProfileProposalSchema.safeParse(bad).success).toBe(false);
  });
});

describe("buildCompareProposalMessages", () => {
  it("carries the topic and the mainland-reachability hint when asked", () => {
    const messages = buildCompareProposalMessages({ topic: "数据分析师", mainland: true });
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toContain("数据分析师");
    expect(user?.content).toContain("中国大陆");
    const noHint = buildCompareProposalMessages({ topic: "data analyst", mainland: false });
    expect(noHint.find((message) => message.role === "user")?.content).not.toContain("中国大陆");
  });
});

describe("verifyEvidenceText", () => {
  it("passes when the page mentions a significant title token", () => {
    expect(verifyEvidenceText("……普通高中数学课程标准全文……", "普通高中数学课程标准")).toBe(true);
    expect(verifyEvidenceText("mdn curriculum landing page", "MDN Curriculum")).toBe(true);
  });

  it("fails on reachable-but-unrelated pages", () => {
    expect(verifyEvidenceText("welcome to my blog about cats", "普通高中数学课程标准")).toBe(false);
  });

  it("extracts sensible tokens", () => {
    expect(significantTokens("MDN Curriculum 前端大纲")).toEqual(
      expect.arrayContaining(["curriculum", "前端大纲"]),
    );
  });
});

describe("pruneUnverifiedBranches", () => {
  const items = [
    proposalItem({ key: "root", sourceUrl: "https://ok.org/a" }),
    proposalItem({ key: "child", parentKey: "root", sourceUrl: "https://bad.org/x" }),
    proposalItem({ key: "grandchild", parentKey: "child", sourceUrl: "https://ok.org/a" }),
    proposalItem({ key: "sibling", parentKey: "root", sourceUrl: "https://ok.org/b" }),
  ];

  it("drops a failed item and its whole subtree, even verified descendants", () => {
    const survivors = pruneUnverifiedBranches(
      items,
      new Set(["https://ok.org/a", "https://ok.org/b"]),
    );
    expect(survivors.map((item) => item.key)).toEqual(["root", "sibling"]);
  });

  it("keeps everything when all URLs verify", () => {
    const survivors = pruneUnverifiedBranches(
      items,
      new Set(["https://ok.org/a", "https://ok.org/b", "https://bad.org/x"]),
    );
    expect(survivors).toHaveLength(4);
  });
});

describe("survivesThreshold", () => {
  it("fails below the absolute minimum or below half survival", () => {
    expect(survivesThreshold(10, 4)).toBe(false); // under MIN_SURVIVING_ITEMS
    expect(survivesThreshold(20, 8)).toBe(false); // under half
    expect(survivesThreshold(10, 6)).toBe(true);
  });
});
