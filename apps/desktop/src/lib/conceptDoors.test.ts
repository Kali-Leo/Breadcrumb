/**
 * Purpose: unit tests for computeDoorPatches — wires one message's sightings, node labels,
 * mastery/curiosity/retention and the diglot weave's reserved spans into pickDoors, and
 * degrades to an empty array on any failure (never throws).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listByMessageMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listByMessage: listByMessageMock },
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

vi.mock("../stores/plannerStore", () => ({
  usePlannerStore: {
    getState: () => ({
      masteryByNode: new Map([["a", 0.2]]),
      interestScoresByNode: new Map([
        ["a", { nodeId: "a", curiosity: 0.8, confusion: 0, boredom: 0, evidenceWeight: 1 }],
      ]),
    }),
  },
}));

vi.mock("../stores/memoryStore", () => ({
  useMemoryStore: { getState: () => ({ retentionByNode: new Map([["a", 0.4]]) }) },
}));

vi.mock("../stores/diglotStore", () => ({
  useDiglotStore: { getState: () => ({ patchesByMessage: new Map() }) },
}));

vi.mock("../stores/doorStore", () => ({
  useDoorStore: { getState: () => ({ openedNodeIds: new Set() }) },
}));

const { computeDoorPatches } = await import("./conceptDoors");

afterEach(() => {
  listByMessageMock.mockReset();
});

describe("computeDoorPatches", () => {
  it("marks a low-mastery, label-matching sighted node as a door", async () => {
    listByMessageMock.mockResolvedValueOnce([
      { id: "s1", node_id: "a", conversation_id: "c1", message_id: "m1", created_at: "t" },
    ]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。");
    expect(doors).toHaveLength(1);
    expect(doors[0]?.nodeId).toBe("a");
  });

  it("returns empty when this message has no sightings", async () => {
    listByMessageMock.mockResolvedValueOnce([]);
    expect(await computeDoorPatches("m1", "闭包是一个概念。")).toEqual([]);
  });

  it("returns empty and never throws when the repo layer fails", async () => {
    listByMessageMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(computeDoorPatches("m1", "闭包")).resolves.toEqual([]);
  });
});
