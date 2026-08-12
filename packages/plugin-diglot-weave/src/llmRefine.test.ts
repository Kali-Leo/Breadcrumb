/**
 * Purpose: tests for the LLM refinement tier (spec 033 T13) — verdict application,
 * defensive handling of malformed output, phrase weaving guards (overlap, clause
 * breakers, not-found), and the whole-set diff-guard fallback.
 */
import { describe, expect, it } from "vitest";
import { applyLlmRefinement, buildLlmRefineMessages } from "./llmRefine";
import type { ReplacementPatch } from "./replace";

const CONTENT = "很多朋友在开始的时候,总是希望马上看到结果,但是学习需要时间。";

const PATCHES: ReplacementPatch[] = [
  { start: 2, end: 4, original: "朋友", replacement: "friend", lemma: "朋友", kind: "word" },
  { start: 13, end: 15, original: "希望", replacement: "hope", lemma: "希望", kind: "word" },
];

describe("applyLlmRefinement", () => {
  it("keeps, retranslates and drops per verdict", () => {
    const outcome = applyLlmRefinement(CONTENT, PATCHES, {
      words: [
        { lemma: "朋友", verdict: "retranslate", target: "pal" },
        { lemma: "希望", verdict: "drop" },
      ],
      phrase: null,
    });
    expect(outcome.patches).toHaveLength(1);
    expect(outcome.patches[0]?.replacement).toBe("pal");
    expect(outcome.changedLemmas.sort()).toEqual(["希望", "朋友"]);
  });

  it("keeps the dictionary word when a retranslation is malformed", () => {
    const outcome = applyLlmRefinement(CONTENT, PATCHES, {
      words: [{ lemma: "朋友", verdict: "retranslate", target: "two words" }],
      phrase: null,
    });
    expect(outcome.patches.find((p) => p.lemma === "朋友")?.replacement).toBe("friend");
  });

  it("weaves a valid phrase as a phrase-kind patch with a gloss", () => {
    const outcome = applyLlmRefinement(CONTENT, PATCHES, {
      words: [],
      phrase: { original: "看到结果", replacement: "see results", gloss: "看到成效" },
    });
    const phrase = outcome.patches.find((p) => p.kind === "phrase");
    expect(phrase?.replacement).toBe("see results");
    expect(phrase?.gloss).toBe("看到成效");
    expect(CONTENT.slice(phrase?.start ?? 0, phrase?.end ?? 0)).toBe("看到结果");
  });

  it("rejects phrases that overlap word patches, cross clauses, or don't exist", () => {
    const overlapping = applyLlmRefinement(CONTENT, PATCHES, {
      words: [],
      phrase: { original: "希望马上", replacement: "x", gloss: "y" },
    });
    expect(overlapping.patches.some((p) => p.kind === "phrase")).toBe(false);
    const crossing = applyLlmRefinement(CONTENT, PATCHES, {
      words: [],
      phrase: { original: "结果,但是", replacement: "x", gloss: "y" },
    });
    expect(crossing.patches.some((p) => p.kind === "phrase")).toBe(false);
    const missing = applyLlmRefinement(CONTENT, PATCHES, {
      words: [],
      phrase: { original: "不存在的短语", replacement: "x", gloss: "y" },
    });
    expect(missing.patches.some((p) => p.kind === "phrase")).toBe(false);
  });

  it("returns the original patches untouched when the diff guard fails", () => {
    const bogus: ReplacementPatch[] = [
      { start: 0, end: 2, original: "错的", replacement: "wrong", lemma: "x", kind: "word" },
    ];
    const outcome = applyLlmRefinement(CONTENT, bogus, { words: [], phrase: null });
    expect(outcome.patches).toEqual(bogus);
    expect(outcome.changedLemmas).toEqual([]);
  });

  it("builds messages naming both languages and every candidate", () => {
    const messages = buildLlmRefineMessages({
      content: CONTENT,
      sourceLang: "zh",
      targetLang: "en",
      replacements: [{ lemma: "朋友", surface: "朋友", target: "friend" }],
    });
    expect(messages[0]?.content).toContain("en");
    expect(messages[1]?.content).toContain("朋友");
  });
});
