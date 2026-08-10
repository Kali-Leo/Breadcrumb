/**
 * Purpose: unit tests for the conservative leaf matcher (spec 023) — normalization
 * symmetry, label/alias equality hits, user-alias hits, and the deliberate absence of any
 * fuzzy matching.
 */
import { describe, expect, it } from "vitest";
import { leafKeysOf, matchProfileLeaves, normalizeLabel } from "./matching";
import type { ProfileItemDefinition } from "./profileSchema";

function item(overrides: Partial<ProfileItemDefinition>): ProfileItemDefinition {
  return {
    key: "k",
    parentKey: null,
    label: "标签",
    aliases: [],
    sourceRef: "某资料 · 第一章",
    conceptId: null,
    ...overrides,
  };
}

const NODES = [
  { id: "n1", label: "Promise" },
  { id: "n2", label: "async/await" },
  { id: "n3", label: "作用域链" },
  { id: "n4", label: "导数" },
];

describe("normalizeLabel", () => {
  it("folds case and strips whitespace symmetrically", () => {
    expect(normalizeLabel("Async / Await")).toBe(normalizeLabel("async/await"));
    expect(normalizeLabel("　全角空格　")).toBe("全角空格");
  });

  it("never equates different concepts", () => {
    expect(normalizeLabel("作用域")).not.toBe(normalizeLabel("作用域链"));
  });
});

describe("leafKeysOf", () => {
  it("treats items nobody parents as leaves", () => {
    const items = [
      item({ key: "root" }),
      item({ key: "child-a", parentKey: "root" }),
      item({ key: "child-b", parentKey: "root" }),
    ];
    expect(leafKeysOf(items)).toEqual(new Set(["child-a", "child-b"]));
  });
});

describe("matchProfileLeaves", () => {
  it("matches by exact normalized label", () => {
    const items = [item({ key: "promise", label: "Promise" })];
    const result = matchProfileLeaves(items, NODES, []);
    expect(result.get("promise")?.nodeId).toBe("n1");
    expect(result.get("promise")?.via).toBe("label");
  });

  it("matches by alias and reports which text hit", () => {
    const items = [item({ key: "async", label: "异步基础", aliases: ["异步", "async/await"] })];
    const result = matchProfileLeaves(items, NODES, []);
    expect(result.get("async")?.nodeId).toBe("n2");
    expect(result.get("async")?.via).toBe("alias");
    expect(result.get("async")?.matchedText).toBe("async/await");
  });

  it("matches through the user's judged-identical alias labels", () => {
    const items = [item({ key: "deriv", label: "一元函数导数" })];
    const aliases = [{ alias_label: "一元函数导数", node_id: "n4" }];
    const result = matchProfileLeaves(items, NODES, aliases);
    expect(result.get("deriv")?.nodeId).toBe("n4");
  });

  it("does NOT fuzzy-match near misses — a missed match stays null", () => {
    const items = [item({ key: "scope", label: "作用域" })]; // user has 作用域链 only
    const result = matchProfileLeaves(items, NODES, []);
    expect(result.get("scope")).toBeNull();
  });

  it("only matches leaves — internal nodes never appear in the result", () => {
    const items = [
      item({ key: "root", label: "Promise" }),
      item({ key: "leaf", parentKey: "root", label: "导数" }),
    ];
    const result = matchProfileLeaves(items, NODES, []);
    expect(result.has("root")).toBe(false);
    expect(result.get("leaf")?.nodeId).toBe("n4");
  });
});
