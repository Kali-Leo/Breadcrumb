/**
 * Purpose: unit tests for messageTree's pure functions across legacy-linear (all NULL
 * parent_id), explicit-tree, and mixed row sets, plus the empty/missing-id edge cases.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  activePath,
  buildMessageTree,
  effectiveParentById,
  forkPoints,
  newestLeafId,
  pathToLeaf,
} from "./messageTree";

function row(id: string, createdAt: string, parentId: string | null): MessageRow {
  return {
    id,
    conversation_id: "c1",
    role: id.startsWith("u") ? "user" : "assistant",
    content: id,
    created_at: createdAt,
    teaching_mode: null,
    parent_id: parentId,
  };
}

describe("effectiveParentById / buildMessageTree — pure legacy-linear", () => {
  const rows = [
    row("m1", "2026-08-14T10:00:00Z", null),
    row("m2", "2026-08-14T10:01:00Z", null),
    row("m3", "2026-08-14T10:02:00Z", null),
  ];

  it("chains each row to the previous one by created_at", () => {
    const parents = effectiveParentById(rows);
    expect(parents.get("m1")).toBeNull();
    expect(parents.get("m2")).toBe("m1");
    expect(parents.get("m3")).toBe("m2");
  });

  it("builds a single linear root with nested children", () => {
    const tree = buildMessageTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.message.id).toBe("m1");
    expect(tree[0]?.children[0]?.message.id).toBe("m2");
    expect(tree[0]?.children[0]?.children[0]?.message.id).toBe("m3");
  });
});

describe("pure explicit tree", () => {
  const rows = [
    row("m1", "2026-08-14T10:00:00Z", null),
    row("m2", "2026-08-14T10:01:00Z", "m1"),
    row("m3", "2026-08-14T10:02:00Z", "m1"), // fork: second child of m1
    row("m4", "2026-08-14T10:03:00Z", "m2"),
  ];

  it("respects explicit parent_id over positional order", () => {
    const parents = effectiveParentById(rows);
    expect(parents.get("m2")).toBe("m1");
    expect(parents.get("m3")).toBe("m1");
    expect(parents.get("m4")).toBe("m2");
  });

  it("identifies the fork point", () => {
    expect([...forkPoints(rows)]).toEqual(["m1"]);
  });

  it("newest leaf is the most recently created leaf across branches", () => {
    // m3 (10:02) has no children and is newer than m4 (10:03)? No — m4 is newest overall.
    expect(newestLeafId(rows)).toBe("m4");
  });

  it("active path follows the newest leaf's branch, not the other fork", () => {
    const path = activePath(rows).map((m) => m.id);
    expect(path).toEqual(["m1", "m2", "m4"]);
  });

  it("pathToLeaf returns the branch for the other fork too", () => {
    expect(pathToLeaf(rows, "m3").map((m) => m.id)).toEqual(["m1", "m3"]);
  });
});

describe("mixed: legacy prefix, explicit suffix", () => {
  const rows = [
    row("m1", "2026-08-14T10:00:00Z", null),
    row("m2", "2026-08-14T10:01:00Z", null), // implicit parent m1
    row("m3", "2026-08-14T10:02:00Z", "m1"), // explicit fork off m1, bypassing m2
  ];

  it("m2's implicit parent is m1; m3's explicit parent is also m1", () => {
    const parents = effectiveParentById(rows);
    expect(parents.get("m2")).toBe("m1");
    expect(parents.get("m3")).toBe("m1");
  });

  it("m1 is a fork point (m2 implicit child, m3 explicit child)", () => {
    expect([...forkPoints(rows)]).toEqual(["m1"]);
  });

  it("newest leaf is m3 (later created_at) even though m2 comes first positionally", () => {
    expect(newestLeafId(rows)).toBe("m3");
    expect(activePath(rows).map((m) => m.id)).toEqual(["m1", "m3"]);
  });
});

describe("edge cases", () => {
  it("empty row set: newestLeafId null, activePath empty, forkPoints empty", () => {
    expect(newestLeafId([])).toBeNull();
    expect(activePath([])).toEqual([]);
    expect(forkPoints([])).toEqual(new Set());
    expect(buildMessageTree([])).toEqual([]);
  });

  it("pathToLeaf returns [] for a leafId absent from rows", () => {
    const rows = [row("m1", "2026-08-14T10:00:00Z", null)];
    expect(pathToLeaf(rows, "does-not-exist")).toEqual([]);
  });

  it("an explicit parent_id pointing outside the row set is treated as a root (fault tolerant)", () => {
    const rows = [
      row("m1", "2026-08-14T10:00:00Z", null),
      row("m2", "2026-08-14T10:01:00Z", "ghost-id"),
    ];
    const parents = effectiveParentById(rows);
    // m2's declared parent doesn't exist among rows, so it falls back to the previous row (m1) —
    // legacy-linear fallback, not a bare root, since a previous row is available.
    expect(parents.get("m2")).toBe("m1");
    const tree = buildMessageTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.message.id).toBe("m2");
  });

  it("a lone row with a dangling parent_id and no previous row becomes a root", () => {
    const rows = [row("m1", "2026-08-14T10:00:00Z", "ghost-id")];
    expect(effectiveParentById(rows).get("m1")).toBeNull();
    expect(buildMessageTree(rows)).toHaveLength(1);
  });
});
