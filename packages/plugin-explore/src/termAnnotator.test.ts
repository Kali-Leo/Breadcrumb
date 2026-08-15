/**
 * Purpose: tests for term-marking prompt assembly and pure post-processing (spec 043) —
 * density clipping above/below the evidence threshold, prompt injection of both evidence
 * lists, and locateTermPatches' overlap/case-insensitivity/hallucination handling.
 */
import { describe, expect, it } from "vitest";
import {
  buildTermMarkingMessages,
  clipTermsByDensity,
  LEARNER_EVIDENCE_THRESHOLD,
  locateTermPatches,
  termMarkResponseSchema,
} from "./termAnnotator";

describe("buildTermMarkingMessages", () => {
  it("injects the answer text and both evidence lists into the user message", () => {
    const messages = buildTermMarkingMessages("闭包捕获了词法环境。", ["变量", "作用域"], ["闭包"]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("闭包捕获了词法环境。");
    expect(userContent).toContain("变量、作用域");
    expect(userContent).toContain("闭包");
  });

  it("renders empty evidence lists as an explicit placeholder, not a blank", () => {
    const messages = buildTermMarkingMessages("正文", [], []);
    expect(messages[1]?.content).toContain("（无）");
  });

  it("system prompt states all three exclusion/ordering rules", () => {
    const [system] = buildTermMarkingMessages("x", [], []);
    expect(system?.content).toContain("宁少勿多");
    expect(system?.content).toContain("基础词");
    expect(system?.content).toContain("已点亮清单");
  });
});

describe("termMarkResponseSchema", () => {
  it("accepts a well-formed term list", () => {
    const parsed = termMarkResponseSchema.parse({ terms: [{ term: "闭包" }, { term: "尾递归" }] });
    expect(parsed.terms.map((t) => t.term)).toEqual(["闭包", "尾递归"]);
  });

  it("accepts an empty term list", () => {
    expect(termMarkResponseSchema.parse({ terms: [] }).terms).toEqual([]);
  });

  it("rejects a malformed entry", () => {
    expect(() => termMarkResponseSchema.parse({ terms: [{ term: "" }] })).toThrow();
  });
});

describe("clipTermsByDensity", () => {
  const terms = ["a", "b", "c", "d", "e"];

  it("does not clip once evidenceCount reaches the threshold", () => {
    expect(clipTermsByDensity(terms, 60, LEARNER_EVIDENCE_THRESHOLD)).toEqual(terms);
  });

  it("does not clip well above the threshold either", () => {
    expect(clipTermsByDensity(terms, 60, LEARNER_EVIDENCE_THRESHOLD + 100)).toEqual(terms);
  });

  it("clips to ceil(answerLength / 60) just below the threshold", () => {
    // 130 chars -> ceil(130/60) = 3
    expect(clipTermsByDensity(terms, 130, LEARNER_EVIDENCE_THRESHOLD - 1)).toEqual(["a", "b", "c"]);
  });

  it("clips to a cap of 1 for a short answer with thin evidence", () => {
    expect(clipTermsByDensity(terms, 10, 0)).toEqual(["a"]);
  });

  it("respects a custom threshold override", () => {
    expect(clipTermsByDensity(terms, 130, 5, 5)).toEqual(terms);
    expect(clipTermsByDensity(terms, 130, 4, 5)).toEqual(["a", "b", "c"]);
  });

  it("never returns more terms than were given, even with a huge cap", () => {
    expect(clipTermsByDensity(terms, 100_000, 0)).toEqual(terms);
  });
});

describe("locateTermPatches", () => {
  it("locates each term's first occurrence, nodeId left null", () => {
    const patches = locateTermPatches("闭包捕获了作用域中的变量。", ["闭包", "变量"]);
    expect(patches).toEqual([
      { start: 0, end: 2, original: "闭包", nodeId: null },
      { start: 10, end: 12, original: "变量", nodeId: null },
    ]);
  });

  it("matches case-insensitively while preserving the original text's casing", () => {
    const patches = locateTermPatches("Closures capture scope.", ["closures"]);
    expect(patches).toEqual([{ start: 0, end: 8, original: "Closures", nodeId: null }]);
  });

  it("drops a term that never appears verbatim (model hallucination)", () => {
    expect(locateTermPatches("闭包捕获了作用域。", ["递归"])).toEqual([]);
  });

  it("skips a term overlapping a reserved span", () => {
    const patches = locateTermPatches(
      "闭包捕获了作用域中的变量。",
      ["闭包", "变量"],
      [{ start: 0, end: 2 }],
    );
    expect(patches.map((p) => p.original)).toEqual(["变量"]);
  });

  it("skips a later term whose first occurrence overlaps an earlier placed term", () => {
    // "闭包" and "包" both match starting inside the same characters.
    const patches = locateTermPatches("闭包是核心概念。", ["闭包", "包"]);
    expect(patches.map((p) => p.original)).toEqual(["闭包"]);
  });

  it("returns results sorted by position regardless of input order", () => {
    const patches = locateTermPatches("闭包捕获了作用域中的变量。", ["变量", "闭包"]);
    expect(patches.map((p) => p.original)).toEqual(["闭包", "变量"]);
  });
});
