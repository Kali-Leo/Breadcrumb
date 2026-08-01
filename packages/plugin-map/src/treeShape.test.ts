/**
 * Purpose: tests for the tree-to-cartography reshaping — depth mapping, tiers,
 * shallow/deep edge cases, dangling parents, deterministic ordering.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { shapeTree } from "./treeShape";

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
