/**
 * Purpose: tests for guess/hover card context — sentence boundaries, and the audit's
 * red line: the context a guess card shows may never contain the answer, i.e. any patch's
 * original source word (audit 2026-08-28 #1).
 */
import { describe, expect, it } from "vitest";
import { contextSentenceFor, wovenContextSentenceFor } from "./contextSentence";

const CONTENT = "学习需要耐心。我很想念我的母亲，也想念我的朋友。明天见。";
const MOTHER = { start: 13, end: 15, original: "母亲", replacement: "mother", lemma: "母亲" };
const FRIEND = { start: 21, end: 23, original: "朋友", replacement: "friend", lemma: "朋友" };

describe("contextSentenceFor", () => {
  it("walks out to the nearest sentence boundaries", () => {
    expect(CONTENT.slice(MOTHER.start, MOTHER.end)).toBe("母亲");
    expect(contextSentenceFor(CONTENT, MOTHER)).toBe("我很想念我的母亲，也想念我的朋友。");
  });
});

describe("wovenContextSentenceFor", () => {
  it("shows the sentence as it is rendered, never the source words", () => {
    const context = wovenContextSentenceFor(CONTENT, [MOTHER, FRIEND], MOTHER);
    expect(context).toBe("我很想念我的mother，也想念我的friend。");
    for (const patch of [MOTHER, FRIEND]) {
      expect(context).not.toContain(patch.original);
    }
  });

  it("keeps the sentence around a patch that follows earlier ones", () => {
    const context = wovenContextSentenceFor(CONTENT, [MOTHER, FRIEND], FRIEND);
    expect(context).toBe("我很想念我的mother，也想念我的friend。");
    expect(context).not.toContain(FRIEND.original);
  });

  it("is the plain sentence when the message has no patches", () => {
    expect(wovenContextSentenceFor(CONTENT, [], MOTHER)).toBe(contextSentenceFor(CONTENT, MOTHER));
  });

  it("skips overlapping or out-of-range patches instead of shifting the span", () => {
    const broken = [
      MOTHER,
      { start: 14, end: 16, replacement: "x" },
      { start: 99, end: 120, replacement: "y" },
    ];
    const context = wovenContextSentenceFor(CONTENT, broken, MOTHER);
    expect(context).toBe("我很想念我的mother，也想念我的朋友。");
  });
});
