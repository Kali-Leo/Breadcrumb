/**
 * Purpose: tests for tree-first continent derivation (spec 031) — a root with children keeps
 * its own name and hands its direct children the kingdoms, flat orphan roots cluster into a
 * continent of member-kingdoms, an unaffiliated orphan leaves as an islet, plus determinism
 * and weights. (Cartographic reshaping is covered by continentShape.test.ts.)
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { type ContinentSummary, deriveContinents } from "./continents";

function node(
  id: string,
  parentId: string | null,
  label = id,
  createdAt = "2026-07-01T00:00:00Z",
): KnowledgeNodeRow {
  return { id, parent_id: parentId, label, summary: "", kind: "concept", created_at: createdAt };
}

/** The spec's own acceptance fixture: 烹饪 with four countries, two of which carry points.
 * Distinct timestamps because siblings are ordered by creation, oldest kingdom first. */
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

describe("deriveContinents", () => {
  it("makes one continent per root-with-children, named by the root, kingdoms by its children", () => {
    const assignment = deriveContinents(cookingNodes(), new Map(), new Map());

    expect(assignment.continents).toHaveLength(1);
    const cooking = assignment.continents[0] as ContinentSummary;
    expect(cooking.label).toBe("烹饪");
    expect(cooking.origin).toBe("tree");
    expect(cooking.id).toBe("cooking");
    expect(cooking.kingdoms.map((kingdom) => kingdom.label)).toEqual([
      "美拉德反应",
      "火候控制",
      "刀工",
      "高汤",
    ]);
    // A kingdom owns its own subtree; the root belongs to the continent but to no kingdom.
    const knife = cooking.kingdoms.find((kingdom) => kingdom.id === "knife");
    expect(new Set(knife?.memberNodeIds)).toEqual(
      new Set(["knife", "knife-julienne", "knife-dice"]),
    );
    expect(cooking.kingdoms.some((kingdom) => kingdom.memberNodeIds.includes("cooking"))).toBe(
      false,
    );
    expect(new Set(cooking.memberNodeIds)).toEqual(
      new Set(cookingNodes().map((member) => member.id)),
    );
    expect(assignment.islets).toEqual([]);
  });

  it("never lets a tree continent share its name with one of its own kingdoms", () => {
    const assignment = deriveContinents(cookingNodes(), new Map(), new Map());
    for (const continent of assignment.continents) {
      for (const kingdom of continent.kingdoms) {
        expect(kingdom.label).not.toBe(continent.label);
      }
    }
  });

  it("sums engagement over every member, defaulting to 1 per member", () => {
    const engagement = new Map<string, number>([
      ["cooking", 3],
      ["knife-dice", 5],
    ]);
    const assignment = deriveContinents(cookingNodes(), new Map(), engagement);
    // 8 members: 3 + 5 + six defaults of 1 = 14
    expect(assignment.continents[0]?.weight).toBe(14);
  });

  it("clusters flat orphan roots into a continent whose kingdoms are its members", () => {
    const nodes = [
      node("spark", null, "Spark"),
      node("hadoop", null, "Hadoop"),
      node("hive", null, "Hive"),
      // Unrelated loners: the relative gate judges affinity against the whole room, so a
      // cluster only reads as one when there is something far away to contrast it with.
      node("kite", null, "风筝"),
      node("opera", null, "歌剧"),
      node("cooking", null, "烹饪"),
      node("knife", "cooking", "刀工"),
    ];
    const embeddings = new Map<string, readonly number[]>([
      ["spark", [1, 0, 0, 0]],
      ["hadoop", [0.99, 0.02, 0, 0]],
      ["hive", [0.98, 0.03, 0, 0]],
      ["kite", [0, 1, 0, 0]],
      ["opera", [0, 0, 1, 0]],
      // The tree root carries an embedding too — it must never be pulled into a cluster.
      ["cooking", [0, 0, 0, 1]],
    ]);

    const assignment = deriveContinents(nodes, embeddings, new Map());

    const cluster = assignment.continents.find((continent) => continent.origin === "cluster");
    expect(new Set(cluster?.memberNodeIds)).toEqual(new Set(["spark", "hadoop", "hive"]));
    expect(cluster?.kingdoms.map((kingdom) => kingdom.id).sort()).toEqual([
      "hadoop",
      "hive",
      "spark",
    ]);
    for (const kingdom of cluster?.kingdoms ?? []) {
      expect(kingdom.memberNodeIds).toEqual([kingdom.id]);
    }
    // The tree continent is untouched by the clustering that happened beside it.
    const tree = assignment.continents.find((continent) => continent.origin === "tree");
    expect(tree?.label).toBe("烹饪");
    expect(new Set(tree?.memberNodeIds)).toEqual(new Set(["cooking", "knife"]));
    expect(assignment.islets.map((islet) => islet.id).sort()).toEqual(["kite", "opera"]);
  });

  it("keeps a cluster's identity on its oldest member as new members join", () => {
    // The island's shape is seeded from this id (Leo 2026-09-01: shape stays put), so joining
    // a cluster must not hand it a new identity. The medoid can and does move; the first
    // member cannot.
    const loners = [node("kite", null, "风筝"), node("opera", null, "歌剧")];
    const lonerEmbeddings: Array<[string, readonly number[]]> = [
      ["kite", [0, 1, 0, 0]],
      ["opera", [0, 0, 1, 0]],
    ];
    const before = deriveContinents(
      [
        node("spark", null, "Spark", "2026-07-01T00:00:00Z"),
        node("hadoop", null, "Hadoop", "2026-07-02T00:00:00Z"),
        ...loners,
      ],
      new Map<string, readonly number[]>([
        ["spark", [1, 0, 0, 0]],
        ["hadoop", [0.99, 0.02, 0, 0]],
        ...lonerEmbeddings,
      ]),
      new Map(),
    );
    const after = deriveContinents(
      [
        node("spark", null, "Spark", "2026-07-01T00:00:00Z"),
        node("hadoop", null, "Hadoop", "2026-07-02T00:00:00Z"),
        node("hive", null, "Hive", "2026-07-09T00:00:00Z"),
        node("flink", null, "Flink", "2026-07-10T00:00:00Z"),
        ...loners,
      ],
      new Map<string, readonly number[]>([
        ["spark", [1, 0, 0, 0]],
        ["hadoop", [0.99, 0.02, 0, 0]],
        ["hive", [0.97, 0.04, 0, 0]],
        ["flink", [0.96, 0.05, 0, 0]],
        ...lonerEmbeddings,
      ]),
      new Map(),
    );

    const clusterOf = (assignment: ReturnType<typeof deriveContinents>): ContinentSummary =>
      assignment.continents.find((continent) => continent.origin === "cluster") as ContinentSummary;
    expect(clusterOf(before).id).toBe("spark");
    expect(clusterOf(after).id).toBe("spark");
    expect(clusterOf(after).memberNodeIds).toContain("flink");
  });

  it("leaves a childless root that clusters with nobody as an unnamed islet", () => {
    const nodes = [
      node("spark", null, "Spark"),
      node("hadoop", null, "Hadoop"),
      node("hive", null, "Hive"),
      node("kite", null, "风筝"),
      node("bread", null, "面包"),
    ];
    const embeddings = new Map<string, readonly number[]>([
      ["spark", [1, 0, 0, 0]],
      ["hadoop", [0.99, 0.02, 0, 0]],
      ["hive", [0.98, 0.03, 0, 0]],
      ["kite", [0, 0, 1, 0]],
      // "bread" carries no embedding at all — similarity cannot be judged, so it is an islet.
    ]);
    const engagement = new Map<string, number>([["kite", 2]]);

    const assignment = deriveContinents(nodes, embeddings, engagement);

    expect(assignment.continents).toHaveLength(1);
    expect(assignment.islets.map((islet) => islet.id)).toEqual(["kite", "bread"]);
    expect(assignment.islets[0]?.weight).toBe(2);
    expect(assignment.islets[1]?.weight).toBe(1);
  });

  it("orders continents by weight then label, deterministically across runs", () => {
    const nodes = [
      node("light", null, "轻"),
      node("light-a", "light"),
      node("heavy", null, "重"),
      node("heavy-a", "heavy"),
      node("heavy-b", "heavy"),
      node("heavy-c", "heavy"),
    ];
    const first = deriveContinents(nodes, new Map(), new Map());
    const second = deriveContinents(nodes, new Map(), new Map());

    expect(first).toEqual(second);
    expect(first.continents.map((continent) => continent.label)).toEqual(["重", "轻"]);
  });

  describe("daily layout rhythm (layoutDayStartIso)", () => {
    const dayStart = "2026-08-31T00:00:00Z";

    it("freezes weight and layoutMemberCount to pre-day members, so today's growth cannot reorder", () => {
      const nodes = [
        node("a", null, "甲", "2026-07-01T00:00:00Z"),
        node("a-1", "a", "甲一", "2026-07-02T00:00:00Z"),
        node("b", null, "乙", "2026-07-01T00:00:00Z"),
        node("b-1", "b", "乙一", "2026-07-02T00:00:00Z"),
      ];
      const before = deriveContinents(nodes, new Map(), new Map(), dayStart);
      // 乙 gains three nodes today, each with heavy engagement.
      const grownToday = [
        ...nodes,
        node("b-2", "b", "乙二", "2026-08-31T09:00:00Z"),
        node("b-3", "b", "乙三", "2026-08-31T10:00:00Z"),
        node("b-4", "b", "乙四", "2026-08-31T11:00:00Z"),
      ];
      const engagement = new Map<string, number>([
        ["b-2", 50],
        ["b-3", 50],
        ["b-4", 50],
      ]);
      const after = deriveContinents(grownToday, new Map(), engagement, dayStart);

      expect(after.continents.map((continent) => continent.id)).toEqual(
        before.continents.map((continent) => continent.id),
      );
      const bBefore = before.continents.find((continent) => continent.id === "b");
      const bAfter = after.continents.find((continent) => continent.id === "b");
      expect(bAfter?.weight).toBe(bBefore?.weight);
      expect(bAfter?.layoutMemberCount).toBe(bBefore?.layoutMemberCount);
      // The new knowledge is still on the map today — only layout inputs wait for tomorrow.
      expect(bAfter?.memberNodeIds).toContain("b-2");
    });

    it("queues continents born today after every established one, in arrival order", () => {
      const nodes = [
        node("old", null, "旧", "2026-07-01T00:00:00Z"),
        node("old-1", "old", "旧一", "2026-07-02T00:00:00Z"),
        node("late", null, "晚生", "2026-08-31T11:00:00Z"),
        node("late-1", "late", "晚生一", "2026-08-31T11:05:00Z"),
        node("early", null, "早生", "2026-08-31T09:00:00Z"),
        node("early-1", "early", "早生一", "2026-08-31T09:05:00Z"),
      ];
      // Massive engagement on a newborn must not buy it a central slot today.
      const engagement = new Map<string, number>([["late", 100]]);
      const assignment = deriveContinents(nodes, new Map(), engagement, dayStart);

      expect(assignment.continents.map((continent) => continent.id)).toEqual([
        "old",
        "early",
        "late",
      ]);
      expect(assignment.continents[1]?.layoutMemberCount).toBe(0);
    });

    it("without a layout day, every member counts (unchanged behaviour)", () => {
      const nodes = [node("a", null, "甲"), node("a-1", "a", "甲一")];
      const assignment = deriveContinents(nodes, new Map(), new Map());
      expect(assignment.continents[0]?.layoutMemberCount).toBe(2);
      expect(assignment.continents[0]?.weight).toBe(2);
    });
  });
});
