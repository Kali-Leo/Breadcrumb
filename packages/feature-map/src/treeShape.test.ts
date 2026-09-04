/**
 * Purpose: tests for the tree-to-cartography reshaping — depth mapping, tiers,
 * shallow/deep edge cases, dangling parents, parent-link cycles, deterministic ordering.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { collectSubtree, indexChildren, shapeTree } from "./treeShape";

function node(
  id: string,
  parentId: string | null,
  createdAt = "2026-07-01T00:00:00Z",
): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label: `label-${id}`,
    summary: "",
    kind: "concept",
    created_at: createdAt,
  };
}

describe("shapeTree", () => {
  it("returns no islands for an empty tree", () => {
    expect(shapeTree([])).toEqual([]);
  });

  it("maps a lone root to an island without kingdoms", () => {
    const islands = shapeTree([node("r1", null)]);
    expect(islands).toHaveLength(1);
    expect(islands.at(0)?.kingdoms).toEqual([]);
    expect(islands.at(0)?.subtreeCount).toBe(1);
    expect(islands.at(0)?.sizeTier).toBe(1);
  });

  it("maps depth 1/2/3+ to kingdom/village/points", () => {
    const rows = [
      node("root", null),
      node("kingdom", "root"),
      node("village", "kingdom"),
      node("point-a", "village"),
      node("point-b", "point-a"),
    ];
    const islands = shapeTree(rows);
    const kingdom = islands.at(0)?.kingdoms.at(0);
    const village = kingdom?.villages.at(0);
    expect(kingdom?.nodeId).toBe("kingdom");
    expect(village?.nodeId).toBe("village");
    expect(village?.points.map((point) => point.nodeId)).toEqual(["point-a", "point-b"]);
    expect(village?.subtreeCount).toBe(3);
    expect(village?.tier).toBe(2);
    expect(islands.at(0)?.memberNodeIds).toHaveLength(5);
  });

  it("treats a dangling parent_id as a root instead of dropping the node", () => {
    const islands = shapeTree([node("orphan", "missing-parent")]);
    expect(islands.map((island) => island.nodeId)).toEqual(["orphan"]);
  });

  it("orders islands by creation time then id", () => {
    const islands = shapeTree([
      node("b", null, "2026-07-02T00:00:00Z"),
      node("a", null, "2026-07-01T00:00:00Z"),
      node("c", null, "2026-07-02T00:00:00Z"),
    ]);
    expect(islands.map((island) => island.nodeId)).toEqual(["a", "b", "c"]);
  });

  it("quantizes island size into tiers", () => {
    const rows: KnowledgeNodeRow[] = [node("root", null)];
    for (let index = 0; index < 15; index += 1) {
      rows.push(node(`child-${index}`, "root"));
    }
    expect(shapeTree(rows).at(0)?.sizeTier).toBe(5); // 16 nodes -> tier 5
    expect(shapeTree(rows.slice(0, 8)).at(0)?.sizeTier).toBe(4); // 8 nodes -> tier 4
    expect(shapeTree(rows.slice(0, 7)).at(0)?.sizeTier).toBe(3); // 7 nodes -> tier 3
  });

  it("gives village tiers by subtree size", () => {
    const rows = [node("root", null), node("kingdom", "root"), node("village", "kingdom")];
    for (let index = 0; index < 9; index += 1) {
      rows.push(node(`point-${index}`, "village"));
    }
    expect(shapeTree(rows).at(0)?.kingdoms.at(0)?.villages.at(0)?.tier).toBe(4);
  });
});

/**
 * A parent cycle used to be catastrophic here and completely silent: a node on the cycle is
 * in no root bucket, so it and its whole subtree simply stopped being drawn. Until 2026-09-04
 * a merge whose duplicate was an ancestor of its canonical produced exactly this. Migration
 * 0053 repairs the stored rows; these tests are the map's own guard, so a database that
 * carries a loop (or acquires one some other way) loses at most one parent link.
 */
describe("parent-link cycles", () => {
  it("still draws a node that is its own parent, and everything under it", () => {
    const islands = shapeTree([node("r1", null), node("canon", "canon"), node("leaf", "canon")]);

    const ids = islands.flatMap((island) => island.memberNodeIds).sort();
    expect(ids).toEqual(["canon", "leaf", "r1"]);
    const canonIsland = islands.find((island) => island.nodeId === "canon");
    expect(canonIsland?.memberNodeIds.sort()).toEqual(["canon", "leaf"]);
  });

  it("cuts a longer loop at one node and keeps the rest of the chain", () => {
    const islands = shapeTree([node("b", "a"), node("c", "b"), node("a", "c")]);

    // "a" is the smallest id on the loop, so it becomes the root; the choice is stable.
    expect(islands.map((island) => island.nodeId)).toEqual(["a"]);
    expect(islands[0]?.memberNodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(islands[0]?.subtreeCount).toBe(3);
  });

  it("keeps two separate loops separate", () => {
    const islands = shapeTree([node("a", "b"), node("b", "a"), node("x", "y"), node("y", "x")]);

    expect(islands.map((island) => island.nodeId).sort()).toEqual(["a", "x"]);
    expect(islands.flatMap((island) => island.memberNodeIds).sort()).toEqual(["a", "b", "x", "y"]);
  });

  it("terminates when collectSubtree is handed a children map that still loops", () => {
    // Not something indexChildren can produce any more; collectSubtree is exported, so this
    // pins that the failure mode is a smaller picture and never an unbounded loop.
    const a = node("a", "b");
    const b = node("b", "a");
    const looping = new Map([
      [null, [a]],
      ["a", [b]],
      ["b", [a]],
    ]);

    const collected = collectSubtree(a, looping);

    expect(collected.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("leaves an ordinary tree indexed exactly as before", () => {
    const children = indexChildren([node("r1", null), node("k1", "r1"), node("v1", "k1")]);

    expect(children.get(null)?.map((row) => row.id)).toEqual(["r1"]);
    expect(children.get("r1")?.map((row) => row.id)).toEqual(["k1"]);
    expect(children.get("k1")?.map((row) => row.id)).toEqual(["v1"]);
  });
});
