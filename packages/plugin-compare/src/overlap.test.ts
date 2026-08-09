/**
 * Purpose: unit tests for the overlap aggregation (spec 023) — leaf lit/unlit semantics,
 * level-by-level ratio roll-up, and authored-order preservation.
 */
import { describe, expect, it } from "vitest";
import type { LeafMatch } from "./matching";
import { buildOverlapTree } from "./overlap";
import type { ProfileItemDefinition } from "./profileSchema";

function item(overrides: Partial<ProfileItemDefinition>): ProfileItemDefinition {
  return {
    key: "k",
    parentKey: null,
    label: "标签",
    aliases: [],
    sourceRef: "某资料 · 第一章",
    ...overrides,
  };
}

function match(itemKey: string, nodeId: string): LeafMatch {
  return { itemKey, nodeId, nodeLabel: nodeId, via: "label", matchedText: itemKey };
}

const ITEMS = [
  item({ key: "root", label: "根类目" }),
  item({ key: "a", parentKey: "root", label: "甲" }),
  item({ key: "b", parentKey: "root", label: "乙" }),
  item({ key: "b1", parentKey: "b", label: "乙一" }),
  item({ key: "b2", parentKey: "b", label: "乙二" }),
];

describe("buildOverlapTree", () => {
  it("rolls ratios up level by level", () => {
    const matches = new Map<string, LeafMatch | null>([
      ["a", match("a", "n-a")],
      ["b1", match("b1", "n-b1")],
      ["b2", null],
    ]);
    const lit = new Set(["n-a", "n-b1"]);
    const roots = buildOverlapTree(ITEMS, matches, (nodeId) => lit.has(nodeId));
    const root = roots[0];
    expect(root?.leafCount).toBe(3);
    expect(root?.matchedLeafCount).toBe(2);
    expect(root?.ratio).toBeCloseTo(2 / 3);
    const b = root?.children.find((child) => child.key === "b");
    expect(b?.ratio).toBeCloseTo(1 / 2);
  });

  it("a matched-but-unlit leaf does not count as overlap", () => {
    const matches = new Map<string, LeafMatch | null>([["a", match("a", "n-a")]]);
    const roots = buildOverlapTree(
      [item({ key: "a", label: "甲" })],
      matches,
      () => false, // nothing lit
    );
    expect(roots[0]?.ratio).toBe(0);
    expect(roots[0]?.match?.nodeId).toBe("n-a");
  });

  it("preserves authored order and multiple roots", () => {
    const items = [item({ key: "r2", label: "后" }), item({ key: "r1", label: "先" })];
    const roots = buildOverlapTree(items, new Map(), () => false);
    expect(roots.map((root) => root.label)).toEqual(["后", "先"]);
  });
});
