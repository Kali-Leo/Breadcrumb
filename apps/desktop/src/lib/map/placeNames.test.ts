/**
 * Purpose: unit tests for the learner's map place names — a user row outranks whatever label
 * the world was built with (tree label or AI continent name), AI rows are never shown on
 * their own, the kingdom that shares a cluster continent's id keeps its own label, and an
 * unchanged world keeps its identity.
 */
import type { MapPlaceNameRow } from "@breadcrumb/core-db";
import type { IslandModel, IsletModel, KingdomModel, WorldModel } from "@breadcrumb/feature-map";
import { describe, expect, it } from "vitest";
import { applyPlaceNames, isPlaceRenamable, userPlaceNames } from "./placeNames";

function kingdom(nodeId: string, label: string): KingdomModel {
  return {
    nodeId,
    label,
    cellPolygons: [],
    labelPosition: { x: 0, y: 0 },
    tintIndex: 0,
    villages: [],
    memberNodeIds: [nodeId],
  };
}

function island(nodeId: string, label: string, kingdoms: KingdomModel[]): IslandModel {
  return {
    nodeId,
    label,
    center: { x: 0, y: 0 },
    radius: 10,
    coastLoops: [],
    landCells: [],
    rivers: [],
    kingdomBorderPaths: [],
    hills: [],
    kingdoms,
    memberNodeIds: kingdoms.map((one) => one.nodeId),
  };
}

function islet(nodeId: string, label: string): IsletModel {
  return { nodeId, label, center: { x: 0, y: 0 }, radius: 3, coastLoops: [], landCells: [] };
}

function row(nodeId: string, label: string, source: "user" | "ai"): MapPlaceNameRow {
  return { node_id: nodeId, custom_label: label, source, updated_at: "2026-09-02T00:00:00Z" };
}

const world: WorldModel = {
  // A tree continent (root + children) and a cluster continent whose id is its earliest
  // member's — that member kingdom shares the island's id.
  islands: [
    island("root", "AI 起的名字", [kingdom("k1", "闭包"), kingdom("k2", "作用域")]),
    island("m1", "词汇聚类", [kingdom("m1", "成员一"), kingdom("m2", "成员二")]),
  ],
  islets: [islet("lone", "孤岛")],
};

describe("userPlaceNames", () => {
  it("keeps user rows only, trimmed, and drops blank ones", () => {
    const names = userPlaceNames([
      row("root", "  我的函数岛 ", "user"),
      row("k1", "AI 建议", "ai"),
      row("k2", "   ", "user"),
    ]);
    expect([...names]).toEqual([["root", "我的函数岛"]]);
  });
});

describe("applyPlaceNames", () => {
  it("lets the learner's name outrank the built label on islands, kingdoms and islets", () => {
    const names = userPlaceNames([
      row("root", "函数岛", "user"),
      row("k2", "变量的范围", "user"),
      row("lone", "小岛", "user"),
    ]);
    const renamed = applyPlaceNames(world, names);
    expect(renamed.islands[0]?.label).toBe("函数岛");
    expect(renamed.islands[0]?.kingdoms.map((one) => one.label)).toEqual(["闭包", "变量的范围"]);
    expect(renamed.islets[0]?.label).toBe("小岛");
    // Everything but the names is the same object — no terrain is rebuilt for a rename.
    expect(renamed.islands[0]?.coastLoops).toBe(world.islands[0]?.coastLoops);
    expect(renamed.islands[1]).toBe(world.islands[1]);
  });

  it("names the cluster island, not the member kingdom that shares its id", () => {
    const renamed = applyPlaceNames(world, new Map([["m1", "我的聚类"]]));
    expect(renamed.islands[1]?.label).toBe("我的聚类");
    expect(renamed.islands[1]?.kingdoms.map((one) => one.label)).toEqual(["成员一", "成员二"]);
    const cluster = world.islands[1];
    if (cluster === undefined) throw new Error("fixture");
    expect(isPlaceRenamable(cluster, "m1")).toBe(false);
    expect(isPlaceRenamable(cluster, "m2")).toBe(true);
  });

  it("returns the same world when nothing applies", () => {
    expect(applyPlaceNames(world, new Map())).toBe(world);
    expect(applyPlaceNames(world, new Map([["elsewhere", "x"]]))).toBe(world);
    expect(applyPlaceNames(world, new Map([["root", "AI 起的名字"]]))).toBe(world);
  });
});
