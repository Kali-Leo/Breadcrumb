/**
 * Purpose: golden-sample coordinate assertions for layoutFocusMap (spec 042 §4), built from
 * the branch scenario in the Leo-confirmed symbol diagram (分支示意.txt): a main column
 * (root -> A -> B), A's second child C forking a new column, and C's question child Q forking
 * a further column with a dashed diagonal.
 */
import { describe, expect, it } from "vitest";
import { layoutFocusMap } from "./focusMapLayout";

const NODES = [
  { id: "root", label: "闭包", kind: "word" as const, parentId: null },
  { id: "a", label: "A", kind: "word" as const, parentId: "root" },
  { id: "b", label: "B", kind: "word" as const, parentId: "a" },
  { id: "c", label: "C", kind: "word" as const, parentId: "a" },
  { id: "q", label: "Q", kind: "question" as const, parentId: "c" },
];

describe("layoutFocusMap", () => {
  it("places the main column straight down and forks C and Q into new columns", () => {
    const layout = layoutFocusMap(NODES, "q");

    const byId = new Map(layout.stations.map((station) => [station.id, station]));
    expect(byId.get("root")).toMatchObject({ x: 24, y: 20 });
    expect(byId.get("a")).toMatchObject({ x: 24, y: 54 });
    expect(byId.get("b")).toMatchObject({ x: 24, y: 88 });
    expect(byId.get("c")).toMatchObject({ x: 108, y: 122 });
    expect(byId.get("q")).toMatchObject({ x: 192, y: 156 });

    // Link order follows the input node order (each non-root node contributes one link).
    expect(layout.links).toEqual([
      { x1: 24, y1: 20, x2: 24, y2: 54, dashed: false }, // root -> A, main column
      { x1: 24, y1: 54, x2: 24, y2: 88, dashed: false }, // A -> B, first word child inherits
      { x1: 24, y1: 54, x2: 108, y2: 122, dashed: false }, // A -> C, second child forks solid
      { x1: 108, y1: 122, x2: 192, y2: 156, dashed: true }, // C -> Q, question forks dashed
    ]);

    expect(layout.width).toBe(272);
    expect(layout.height).toBe(176);
  });

  it("marks the root-to-current chain, skipping siblings off that line", () => {
    const layout = layoutFocusMap(NODES, "q");
    const onPathIds = layout.stations.filter((s) => s.onCurrentPath).map((s) => s.id);
    expect(onPathIds.sort()).toEqual(["a", "c", "q", "root"]);
    expect(layout.stations.find((s) => s.id === "b")?.onCurrentPath).toBe(false);
    expect(layout.stations.find((s) => s.id === "q")?.isCurrent).toBe(true);
    expect(layout.stations.find((s) => s.id === "c")?.isCurrent).toBe(false);
  });

  it("every station and link stays present regardless of the current station (灰但永不隐藏)", () => {
    const layout = layoutFocusMap(NODES, "b");
    expect(layout.stations).toHaveLength(5);
    expect(layout.links).toHaveLength(4);
  });

  it("returns an empty layout for no nodes", () => {
    const layout = layoutFocusMap([], null);
    expect(layout.stations).toEqual([]);
    expect(layout.links).toEqual([]);
    expect(layout.width).toBe(24 + 80);
    expect(layout.height).toBe(20 + 20);
  });
});
