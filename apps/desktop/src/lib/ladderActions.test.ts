/**
 * Purpose: unit tests for the ladder assessment's pure snapshot builder (spec 022) — the
 * freshness wording tiers, the touched/not-yet split, and both list caps.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildKnowledgeSnapshot } from "./ladderActions";

const LIT = 0.6;

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "",
    kind: "concept",
    created_at: "2026-08-09T00:00:00Z",
  };
}

describe("buildKnowledgeSnapshot", () => {
  it("splits touched vs not-yet and words freshness by mastery tier", () => {
    const nodes = [node("a", "极限"), node("b", "导数"), node("c", "积分"), node("d", "级数")];
    const mastery = new Map([
      ["a", 0.9],
      ["b", 0.65],
      ["c", 0.3],
      ["d", 0.05],
    ]);
    const snapshot = buildKnowledgeSnapshot(["a", "b", "c", "d"], nodes, mastery, LIT);
    expect(snapshot.learnedItems).toEqual([
      { label: "极限", freshness: "熟" },
      { label: "导数", freshness: "刚学会" },
      { label: "积分", freshness: "有点生疏" },
    ]);
    expect(snapshot.notYetLabels).toEqual(["级数"]);
  });

  it("caps the learned list at 12 and the not-yet list at 8", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `n${index}`);
    const nodes = ids.map((id) => node(id, `概念${id}`));
    const mastery = new Map(ids.slice(0, 20).map((id) => [id, 0.9] as const));
    const snapshot = buildKnowledgeSnapshot(ids, nodes, mastery, LIT);
    expect(snapshot.learnedItems).toHaveLength(12);
    expect(snapshot.notYetLabels).toHaveLength(8);
  });

  it("skips ids without a known label instead of inventing entries", () => {
    const snapshot = buildKnowledgeSnapshot(["ghost"], [], new Map(), LIT);
    expect(snapshot.learnedItems).toHaveLength(0);
    expect(snapshot.notYetLabels).toHaveLength(0);
  });
});
