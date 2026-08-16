/**
 * Purpose: unit tests for the goal-mode world cut — islands/kingdoms/islets with zero goal
 * nodes disappear, and a goal touching nothing yields an empty world (the caller falls back
 * to the full map for that case).
 */
import type { IslandModel, IsletModel, KingdomModel, WorldModel } from "@breadcrumb/plugin-map";
import { describe, expect, it } from "vitest";
import { filterWorldToGoal } from "./goalWorldFilter";

function kingdom(nodeId: string, memberNodeIds: string[]): KingdomModel {
  return {
    nodeId,
    label: nodeId,
    cellPolygons: [],
    labelPosition: { x: 0, y: 0 },
    tintIndex: 0,
    villages: [],
    memberNodeIds,
  };
}

function island(nodeId: string, kingdoms: KingdomModel[]): IslandModel {
  return {
    nodeId,
    label: nodeId,
    center: { x: 0, y: 0 },
    radius: 10,
    coastLoops: [],
    landCells: [],
    rivers: [],
    kingdomBorderPaths: [],
    hills: [],
    kingdoms,
    memberNodeIds: kingdoms.flatMap((one) => one.memberNodeIds),
  };
}

function islet(nodeId: string): IsletModel {
  return {
    nodeId,
    label: nodeId,
    center: { x: 0, y: 0 },
    radius: 2,
    coastLoops: [],
    landCells: [],
  };
}

const WORLD: WorldModel = {
  islands: [
    island("island-a", [kingdom("kingdom-a1", ["n1", "n2"]), kingdom("kingdom-a2", ["n3"])]),
    island("island-b", [kingdom("kingdom-b1", ["n4"])]),
  ],
  islets: [islet("n5"), islet("n6")],
};

describe("filterWorldToGoal", () => {
  it("keeps only places holding at least one goal node", () => {
    const cut = filterWorldToGoal(WORLD, new Set(["n1", "n5"]));
    expect(cut.islands.map((one) => one.nodeId)).toEqual(["island-a"]);
    expect(cut.islands[0]?.kingdoms.map((one) => one.nodeId)).toEqual(["kingdom-a1"]);
    expect(cut.islets.map((one) => one.nodeId)).toEqual(["n5"]);
  });

  it("returns an empty world when the goal touches no place", () => {
    const cut = filterWorldToGoal(WORLD, new Set(["elsewhere"]));
    expect(cut.islands).toHaveLength(0);
    expect(cut.islets).toHaveLength(0);
  });

  it("does not mutate the source world", () => {
    filterWorldToGoal(WORLD, new Set(["n3"]));
    expect(WORLD.islands[0]?.kingdoms).toHaveLength(2);
  });
});
