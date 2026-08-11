/**
 * Purpose: tests for reshaping derived continents into islands — kingdoms taken verbatim from
 * the continent (a tree continent's direct children, with their own subtrees nested below as
 * villages), lone-point kingdoms for cluster members, and sizeTier quantized from weight.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { shapeContinents } from "./continentShape";
import { type ContinentSummary, deriveContinents } from "./continents";

function node(
  id: string,
  parentId: string | null,
  label = id,
  createdAt = "2026-07-01T00:00:00Z",
): KnowledgeNodeRow {
  return { id, parent_id: parentId, label, summary: "", kind: "concept", created_at: createdAt };
}

/** Siblings are ordered by creation, so the fixture spells its timestamps out. */
function cookingNodes(): KnowledgeNodeRow[] {
  return [
    node("cooking", null, "烹饪", "2026-07-01T00:00:00Z"),
    node("maillard", "cooking", "美拉德反应", "2026-07-02T00:00:00Z"),
    node("heat", "cooking", "火候控制", "2026-07-03T00:00:00Z"),
    node("knife", "cooking", "刀工", "2026-07-04T00:00:00Z"),
    node("stock", "cooking", "高汤", "2026-07-05T00:00:00Z"),
    node("maillard-temp", "maillard", "反应温度", "2026-07-06T00:00:00Z"),
    node("knife-julienne", "knife", "切丝", "2026-07-07T00:00:00Z"),
    node("knife-dice", "knife", "切丁", "2026-07-08T00:00:00Z"),
  ];
}

function loneContinent(id: string, weight: number): ContinentSummary {
  return {
    id,
    label: id,
    memberNodeIds: [id],
    weight,
    origin: "cluster",
    kingdoms: [{ id, label: id, memberNodeIds: [id] }],
  };
}

describe("shapeContinents", () => {
  it("takes its kingdoms verbatim from the continent and nests each child's subtree", () => {
    const nodes = cookingNodes();
    const assignment = deriveContinents(nodes, new Map(), new Map());
    const islands = shapeContinents(nodes, assignment.continents);

    expect(islands).toHaveLength(1);
    const cooking = islands[0];
    expect(cooking?.nodeId).toBe("continent:cooking");
    expect(cooking?.label).toBe("烹饪");
    expect(cooking?.kingdoms.map((kingdom) => kingdom.label)).toEqual([
      "美拉德反应",
      "火候控制",
      "刀工",
      "高汤",
    ]);
    const knife = cooking?.kingdoms.find((kingdom) => kingdom.nodeId === "knife");
    expect(knife?.villages.map((village) => village.label).sort()).toEqual(["切丁", "切丝"]);
  });

  it("quantizes island sizeTier 1..6 relative to the heaviest continent", () => {
    const nodes = [node("light", null), node("medium", null), node("heavy", null)];
    const continents = [loneContinent("light", 1), loneContinent("medium", 3)];
    continents.push(loneContinent("heavy", 6));

    const islands = shapeContinents(nodes, continents);

    expect(islands.find((island) => island.label === "heavy")?.sizeTier).toBe(6);
    expect(islands.find((island) => island.label === "medium")?.sizeTier).toBe(3);
    expect(islands.find((island) => island.label === "light")?.sizeTier).toBe(1);
    for (const island of islands) {
      expect(island.nodeId.startsWith("continent:")).toBe(true);
      // A cluster member is a lone-point kingdom: itself, no villages below it.
      expect(island.kingdoms).toHaveLength(1);
      expect(island.kingdoms[0]?.villages).toEqual([]);
    }
  });
});
