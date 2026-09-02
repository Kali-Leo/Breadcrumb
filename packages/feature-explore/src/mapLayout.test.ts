/**
 * Purpose: golden-sample coordinate assertions for layoutFocusMap (spec 042 §4) — the
 * mind-map/subway-fork layout Leo described as "a 下挂 (b,c)": a fork scenario (one word child,
 * one question child, laid out as peers with the parent centered above them) and a single-chain
 * scenario (every node has exactly one child, so the whole line falls straight down one column).
 */
import { describe, expect, it } from "vitest";
import { layoutFocusMap } from "./mapLayout";

const FORK_NODES = [
  { id: "a", label: "A", kind: "word" as const, parentId: null },
  { id: "b", label: "B", kind: "word" as const, parentId: "a" },
  { id: "c", label: "C", kind: "question" as const, parentId: "a" },
];

const CHAIN_NODES = [
  { id: "r", label: "R", kind: "word" as const, parentId: null },
  { id: "x", label: "X", kind: "word" as const, parentId: "r" },
  { id: "y", label: "Y", kind: "word" as const, parentId: "x" },
  { id: "z", label: "Z", kind: "question" as const, parentId: "y" },
];

describe("layoutFocusMap: fork (a 下挂 b、c)", () => {
  it("lays b and c out as peers on the next row, centers a above them", () => {
    const layout = layoutFocusMap(FORK_NODES, "c");

    const byId = new Map(layout.stations.map((station) => [station.id, station]));
    expect(byId.get("b")).toMatchObject({ x: 24, y: 54 });
    expect(byId.get("c")).toMatchObject({ x: 120, y: 54 });
    // a's x is the midpoint of its two children — centered above the pair, not aligned to either.
    expect(byId.get("a")).toMatchObject({ x: 72, y: 20 });

    // Link order follows the input node order (each non-root node contributes one link).
    expect(layout.links).toEqual([
      {
        // a -> b: word child, solid fork down-across-down.
        points: [
          { x: 72, y: 20 },
          { x: 72, y: 37 },
          { x: 24, y: 37 },
          { x: 24, y: 54 },
        ],
        dashed: false,
      },
      {
        // a -> c: question child, same fork shape but dashed.
        points: [
          { x: 72, y: 20 },
          { x: 72, y: 37 },
          { x: 120, y: 37 },
          { x: 120, y: 54 },
        ],
        dashed: true,
      },
    ]);

    expect(layout.width).toBe(240);
    expect(layout.height).toBe(74);
  });

  it("marks the root-to-current chain, skipping siblings off that line", () => {
    const layout = layoutFocusMap(FORK_NODES, "c");
    const onPathIds = layout.stations.filter((s) => s.onCurrentPath).map((s) => s.id);
    expect(onPathIds.sort()).toEqual(["a", "c"]);
    expect(layout.stations.find((s) => s.id === "b")?.onCurrentPath).toBe(false);
    expect(layout.stations.find((s) => s.id === "c")?.isCurrent).toBe(true);
    expect(layout.stations.find((s) => s.id === "a")?.isCurrent).toBe(false);
  });

  it("every station and link stays present regardless of the current station (灰但永不隐藏)", () => {
    const layout = layoutFocusMap(FORK_NODES, "b");
    expect(layout.stations).toHaveLength(3);
    expect(layout.links).toHaveLength(2);
  });
});

describe("layoutFocusMap: single-chain degenerates to a straight fall", () => {
  it("keeps every station on the same column when each node has exactly one child", () => {
    const layout = layoutFocusMap(CHAIN_NODES, "z");
    const byId = new Map(layout.stations.map((station) => [station.id, station]));
    expect(byId.get("r")).toMatchObject({ x: 24, y: 20 });
    expect(byId.get("x")).toMatchObject({ x: 24, y: 54 });
    expect(byId.get("y")).toMatchObject({ x: 24, y: 88 });
    expect(byId.get("z")).toMatchObject({ x: 24, y: 122 });

    // Every elbow's two mid points collapse onto the same x — a straight vertical line.
    for (const link of layout.links) {
      const xs = new Set(link.points.map((point) => point.x));
      expect(xs.size).toBe(1);
    }
    expect(layout.links.at(-1)).toMatchObject({ dashed: true }); // y -> z is a question child

    expect(layout.width).toBe(144);
    expect(layout.height).toBe(142);
  });
});

describe("layoutFocusMap: empty map", () => {
  it("returns an empty layout for no nodes", () => {
    const layout = layoutFocusMap([], null);
    expect(layout.stations).toEqual([]);
    expect(layout.links).toEqual([]);
    expect(layout.width).toBe(24 + 120);
    expect(layout.height).toBe(20 + 20);
  });
});
