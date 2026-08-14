/**
 * Purpose: unit tests for computeFocusDoorPatches — every known knowledge node is a door
 * candidate against the focus station's own text (no sightings/message id involved), degrading
 * to an empty array on any failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listAllSightingsMock = vi.fn();
const listAllClaimsMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listAll: listAllSightingsMock },
    masteryClaims: { listAll: listAllClaimsMock },
  })),
}));

vi.mock("../stores/knowledgeStore", () => ({
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

vi.mock("../stores/memoryStore", () => ({
  useMemoryStore: { getState: () => ({ retentionByNode: new Map([["a", 0.9]]) }) },
}));

const { computeFocusDoorPatches } = await import("./focusDoors");

afterEach(() => {
  listAllSightingsMock.mockReset();
  listAllClaimsMock.mockReset();
});

describe("computeFocusDoorPatches", () => {
  it("marks a known node's label found in the station text as a door", async () => {
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches("闭包捕获了作用域中的变量。", new Set());
    expect(doors.map((door) => door.nodeId).sort()).toEqual(["a", "b"]);
  });

  it("skips node ids already opened this focus session", async () => {
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeFocusDoorPatches("闭包捕获了作用域中的变量。", new Set(["a"]));
    expect(doors.map((door) => door.nodeId)).toEqual(["b"]);
  });

  it("returns empty when nothing in the text matches a known node", async () => {
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    expect(await computeFocusDoorPatches("这段话不提任何已知概念。", new Set())).toEqual([]);
  });

  it("returns empty and never throws when the repo layer fails", async () => {
    listAllSightingsMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(computeFocusDoorPatches("闭包", new Set())).resolves.toEqual([]);
  });
});
