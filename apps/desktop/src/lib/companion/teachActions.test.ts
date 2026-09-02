/**
 * Purpose: tests for teach-back pure logic — candidate picking by review worth, topic
 * round-trip through the title, and plain copy invariants (spec 034).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildTeachSystemPrompt, pickTeachCandidates, teachTopicFromTitle } from "./teachActions";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, label, summary: "", parent_id: null, kind: "concept", created_at: "t" };
}

describe("pickTeachCandidates", () => {
  it("returns the highest review worth first, capped, skipping nodes with no footprint", () => {
    const nodes = [node("a", "闭包"), node("b", "导数"), node("c", "极限"), node("d", "无踪影")];
    const reviewPriority = new Map([
      ["a", 0.2],
      ["b", 1.4],
      ["c", 0.9],
    ]);
    const picked = pickTeachCandidates(nodes, reviewPriority, 2);
    expect(picked.map((n) => n.id)).toEqual(["b", "c"]);
  });
});

describe("teach topic round-trip", () => {
  it("recovers the topic from the conversation title", () => {
    expect(teachTopicFromTitle("回讲·闭包")).toBe("闭包");
    expect(teachTopicFromTitle("换你讲·闭包")).toBe("闭包");
    // Whatever language wrote the prefix, the separator is what carries the topic.
    expect(teachTopicFromTitle("Explaining · closures")).toBe("closures");
    expect(teachTopicFromTitle("别的标题")).toBe("别的标题");
  });
});

describe("teach prompt", () => {
  // The opener moved into the catalogue, where locales/copyGate.test.ts scans it (along with
  // every other user-visible string) against the pressure lexicon and the praise list.
  it("keeps the student prompt plain — no praise words", () => {
    const praise = ["真棒", "太棒", "厉害", "优秀", "了不起"];
    const prompt = buildTeachSystemPrompt("闭包");
    for (const word of praise) {
      expect(prompt).not.toContain(word);
    }
    expect(prompt).toContain("闭包");
  });
});
