/**
 * Purpose: tests for the world orchestrator — determinism, layout stability under
 * growth, kingdom partition completeness, retention aggregation.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import type { ContinentAssignment } from "./continents";
import { averageRetention } from "./retention";
import { buildWorldModel } from "./world";

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

function demoTree(): KnowledgeNodeRow[] {
  const rows: KnowledgeNodeRow[] = [
    node("math", null, "2026-07-01T00:00:00Z"),
    node("algebra", "math"),
    node("analysis", "math"),
    node("groups", "algebra"),
    node("rings", "algebra"),
    node("limits", "analysis"),
    node("web", null, "2026-07-02T00:00:00Z"),
    node("frontend", "web"),
    node("react", "frontend"),
  ];
  for (let index = 0; index < 6; index += 1) {
    rows.push(node(`groups-fact-${index}`, "groups"));
  }
  return rows;
}

describe("buildWorldModel", () => {
  it("returns an empty world for no knowledge", () => {
    expect(buildWorldModel([]).islands).toEqual([]);
  });

  it("is deterministic — two runs produce deeply equal worlds", () => {
    expect(buildWorldModel(demoTree())).toEqual(buildWorldModel(demoTree()));
  });

  it("keeps existing islands anchored when new knowledge arrives", () => {
    const before = buildWorldModel(demoTree());
    const grown = [
      ...demoTree(),
      node("rust", null, "2026-07-10T00:00:00Z"),
      node("limits-fact", "limits", "2026-07-10T00:00:00Z"),
    ];
    const after = buildWorldModel(grown);

    expect(after.islands).toHaveLength(before.islands.length + 1);
    for (const island of before.islands) {
      const still = after.islands.find((candidate) => candidate.nodeId === island.nodeId);
      expect(still?.center).toEqual(island.center);
    }
    // The web island did not cross a size tier, so its coastline is untouched.
    const webBefore = before.islands.find((island) => island.nodeId === "web");
    const webAfter = after.islands.find((island) => island.nodeId === "web");
    expect(webAfter?.coastLoops).toEqual(webBefore?.coastLoops);
  });

  it("assigns every kingdom a non-empty territory and places villages inside the world", () => {
    const world = buildWorldModel(demoTree());
    const math = world.islands.find((island) => island.nodeId === "math");
    expect(math?.kingdoms).toHaveLength(2);
    for (const kingdom of math?.kingdoms ?? []) {
      expect(kingdom.cellPolygons.length).toBeGreaterThan(0);
      for (const village of kingdom.villages) {
        expect(Number.isFinite(village.position.x)).toBe(true);
        expect(Number.isFinite(village.position.y)).toBe(true);
      }
    }
    // Two kingdoms on one island -> there must be a drawn frontier.
    expect((math?.kingdomBorderPaths ?? []).length).toBeGreaterThan(0);
  });

  it("keeps deep descendants as village points", () => {
    const world = buildWorldModel(demoTree());
    const algebra = world.islands
      .find((island) => island.nodeId === "math")
      ?.kingdoms.find((kingdom) => kingdom.nodeId === "algebra");
    const groups = algebra?.villages.find((village) => village.nodeId === "groups");
    expect(groups?.points).toHaveLength(6);
    expect(groups?.tier).toBe(3);
  });
});

describe("islets", () => {
  const nodes = [
    node("math", null),
    node("algebra", "math"),
    node("analysis", "math"),
    node("kite", null),
    node("bread", null),
  ];
  const assignment: ContinentAssignment = {
    continents: [
      {
        id: "math",
        label: "label-math",
        memberNodeIds: ["math", "algebra", "analysis"],
        weight: 3,
        origin: "tree",
        kingdoms: [
          { id: "algebra", label: "label-algebra", memberNodeIds: ["algebra"] },
          { id: "analysis", label: "label-analysis", memberNodeIds: ["analysis"] },
        ],
      },
    ],
    islets: [
      { id: "kite", label: "label-kite", memberNodeIds: ["kite"], weight: 1 },
      { id: "bread", label: "label-bread", memberNodeIds: ["bread"], weight: 1 },
    ],
  };

  it("has none at all when no topic assignment is supplied", () => {
    expect(buildWorldModel(nodes).islets).toEqual([]);
  });

  it("gives every one-touch interest a small landmass in open water, deterministically", () => {
    const world = buildWorldModel(nodes, assignment);

    // Islets keep the order deriveContinents handed over; the seed is order-independent.
    expect(world.islets.map((islet) => islet.nodeId)).toEqual(["kite", "bread"]);
    for (const islet of world.islets) {
      expect(islet.coastLoops.length).toBeGreaterThan(0);
      expect(islet.landCells.length).toBeGreaterThan(0);
      for (const island of world.islands) {
        const distance = Math.hypot(
          islet.center.x - island.center.x,
          islet.center.y - island.center.y,
        );
        expect(distance).toBeGreaterThanOrEqual(island.radius * 1.35 + 140);
      }
    }
    const [first, second] = world.islets;
    expect(
      Math.hypot(
        (first?.center.x ?? 0) - (second?.center.x ?? 0),
        (first?.center.y ?? 0) - (second?.center.y ?? 0),
      ),
    ).toBeGreaterThanOrEqual(240);
    expect(buildWorldModel(nodes, assignment)).toEqual(world);
  });

  it("draws only islets when the assignment found no continent at all", () => {
    const loners: ContinentAssignment = { continents: [], islets: assignment.islets };
    const world = buildWorldModel(nodes, loners);

    expect(world.islands).toEqual([]);
    expect(world.islets).toHaveLength(2);
  });
});

describe("averageRetention", () => {
  it("averages known members and treats unknown members as remembered", () => {
    const retention = new Map([
      ["a", 0.2],
      ["b", 0.6],
    ]);
    expect(averageRetention(["a", "b"], retention)).toBeCloseTo(0.4);
    expect(averageRetention(["a", "unknown"], retention)).toBeCloseTo(0.6);
    expect(averageRetention([], retention)).toBe(1);
  });
});
