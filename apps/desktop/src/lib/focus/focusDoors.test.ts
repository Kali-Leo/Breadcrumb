/**
 * Purpose: unit tests for computeFocusDoorPatches (spec 043 §6-7) — the LLM term-marking call
 * is the primary door source; the old "every known node is a candidate" match is secondary,
 * only for non-hub-generic nodes, and never overlaps a term door's span.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listAllSightingsMock = vi.fn();
const listAllClaimsMock = vi.fn();

vi.mock("../platform/db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listAll: listAllSightingsMock },
    masteryClaims: { listAll: listAllClaimsMock },
  })),
}));

const ensureTermMarksMock = vi.fn();
vi.mock("./termMarking", () => ({ ensureTermMarks: ensureTermMarksMock }));

vi.mock("../../stores/knowledgeStore", () => ({
  useKnowledgeStore: {
    getState: () => ({
      nodes: [
        { id: "a", label: "闭包", summary: "s", parent_id: null, kind: "concept", created_at: "t" },
        {
          id: "b",
          label: "作用域",
          summary: "s",
          parent_id: null,
          kind: "concept",
          created_at: "t",
        },
      ],
    }),
  },
}));

vi.mock("../../stores/memoryStore", () => ({
  useMemoryStore: { getState: () => ({ retentionByNode: new Map([["a", 0.9]]) }) },
}));

const { computeFocusDoorPatches } = await import("./focusDoors");

afterEach(() => {
  listAllSightingsMock.mockReset();
  listAllClaimsMock.mockReset();
  ensureTermMarksMock.mockReset();
});

describe("computeFocusDoorPatches", () => {
  it("marks an LLM-picked term as the primary door, enriched with a matching node id", async () => {
    ensureTermMarksMock.mockResolvedValueOnce(["闭包"]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches(
      "闭包捕获了作用域中的变量。",
      new Set(),
      "node-1",
      "c1",
    );
    // The primary term door for "闭包" plus the secondary source's independent door for the
    // non-overlapping "作用域" node.
    expect(doors).toEqual([
      { start: 0, end: 2, original: "闭包", nodeId: "a" },
      { start: 5, end: 8, original: "作用域", nodeId: "b" },
    ]);
    expect(ensureTermMarksMock).toHaveBeenCalledWith(
      "focus_node",
      "node-1",
      "闭包捕获了作用域中的变量。",
      "c1",
    );
  });

  it("secondary source: every known node's label is still a candidate against the station text", async () => {
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches(
      "闭包捕获了作用域中的变量。",
      new Set(),
      "node-1",
      "c1",
    );
    expect(doors.map((door) => door.nodeId).sort()).toEqual(["a", "b"]);
  });

  it("skips node ids already opened this focus session (secondary source)", async () => {
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches(
      "闭包捕获了作用域中的变量。",
      new Set(["a"]),
      "node-1",
      "c1",
    );
    expect(doors.map((door) => door.nodeId)).toEqual(["b"]);
  });

  it("never lets the secondary source duplicate a primary term door's span", async () => {
    ensureTermMarksMock.mockResolvedValueOnce(["闭包"]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches(
      "闭包捕获了作用域中的变量。",
      new Set(),
      "node-1",
      "c1",
    );
    expect(doors.map((door) => door.original)).toEqual(["闭包", "作用域"]);
  });

  it("returns empty when nothing is term-marked and nothing in the text matches a known node", async () => {
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    expect(
      await computeFocusDoorPatches("这段话不提任何已知概念。", new Set(), "node-1", "c1"),
    ).toEqual([]);
  });

  it("returns empty and never throws when the repo layer fails", async () => {
    listAllSightingsMock.mockRejectedValueOnce(new Error("db locked"));
    listAllClaimsMock.mockResolvedValueOnce([]);
    await expect(computeFocusDoorPatches("闭包", new Set(), "node-1", "c1")).resolves.toEqual([]);
  });

  it("also degrades to empty when the term-marking call itself fails", async () => {
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    ensureTermMarksMock.mockRejectedValueOnce(new Error("llm timeout"));
    await expect(computeFocusDoorPatches("闭包", new Set(), "node-1", "c1")).resolves.toEqual([]);
  });
});
