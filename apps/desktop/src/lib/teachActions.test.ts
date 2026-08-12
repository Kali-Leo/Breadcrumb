/**
 * Purpose: tests for teach-back pure logic — candidate picking by lowest retention,
 * topic round-trip through the title, and plain copy invariants (spec 034).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  buildTeachSystemPrompt,
  pickTeachCandidates,
  TEACH_COPY,
  teachTopicFromTitle,
} from "./teachActions";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, label, summary: "", parent_id: null, kind: "concept", created_at: "t" };
}

describe("pickTeachCandidates", () => {
  it("returns lowest-retention nodes first, capped, skipping unknown nodes", () => {
    const nodes = [node("a", "闭包"), node("b", "导数"), node("c", "极限"), node("d", "无踪影")];
    const retention = new Map([
      ["a", 0.9],
      ["b", 0.4],
      ["c", 0.6],
    ]);
    const picked = pickTeachCandidates(nodes, retention, 2);
    expect(picked.map((n) => n.id)).toEqual(["b", "c"]);
  });
});

describe("teach topic round-trip", () => {
  it("recovers the topic from the conversation title", () => {
    expect(teachTopicFromTitle("回讲·闭包")).toBe("闭包");
    expect(teachTopicFromTitle("别的标题")).toBe("别的标题");
  });
});

describe("teach copy", () => {
  it("keeps the opener and prompt plain — no praise words", () => {
    const praise = ["真棒", "太棒", "厉害", "优秀", "了不起"];
    const texts = [TEACH_COPY.opener("闭包"), buildTeachSystemPrompt("闭包")];
    for (const text of texts) {
      for (const word of praise) {
        expect(text).not.toContain(word);
      }
    }
    expect(buildTeachSystemPrompt("闭包")).toContain("闭包");
  });
});
