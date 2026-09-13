import { describe, expect, it } from "vitest";
import { entityTokens, pairingHolds, quoteExistsIn } from "./checks";
import type { TopicPassage } from "./passages";

const PASSAGES: TopicPassage[] = [
  {
    index: 1,
    source: "wikipedia",
    title: "珠穆朗玛峰",
    url: "https://example.org/1",
    text: "珠穆朗玛峰的高度为 8848.86 米，2020 年由中国和尼泊尔共同公布。",
  },
];

describe("pairingHolds — check two", () => {
  it("accepts a match whose passage carries the sentence's own figure", () => {
    expect(pairingHolds("珠峰高 8848.86 米。", PASSAGES[0]?.text ?? "")).toBe(true);
  });

  it("refuses a near-identical sentence with a different figure", () => {
    // The two sentences are all but identical to any similarity score; only the figure
    // separates them, which is exactly the failure this check exists for.
    expect(pairingHolds("珠峰高 8844.43 米。", PASSAGES[0]?.text ?? "")).toBe(false);
  });

  it("falls back to the subject entity when the sentence states no figure", () => {
    expect(pairingHolds("珠穆朗玛峰是世界最高峰。", PASSAGES[0]?.text ?? "")).toBe(true);
    expect(pairingHolds("马里亚纳海沟是最深的地方。", PASSAGES[0]?.text ?? "")).toBe(false);
  });
});

describe("entityTokens", () => {
  it("skips short Latin function words but keeps short CJK words", () => {
    expect(entityTokens("the summit of Everest")).not.toContain("the");
    expect(entityTokens("珠峰的高度")).toContain("高度");
  });
});

describe("quoteExistsIn — check three", () => {
  it("accepts a quote taken from a passage, whitespace aside", () => {
    expect(quoteExistsIn("珠穆朗玛峰的高度为 8848.86米", PASSAGES)).toBe(true);
  });

  it("refuses a quote no passage contains", () => {
    expect(quoteExistsIn("珠穆朗玛峰的高度为 8844.43 米", PASSAGES)).toBe(false);
  });

  it("refuses a fragment too short to be a quote", () => {
    expect(quoteExistsIn("的", PASSAGES)).toBe(false);
  });
});
