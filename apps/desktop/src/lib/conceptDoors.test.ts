/**
 * Purpose: unit tests for computeDoorPatches (spec 043 §6-7) — the LLM term-marking call is
 * the primary door source (located via locateTermPatches, enriched with a nodeId on exact
 * label match); the old sighted-node label match is secondary, only for nodes that aren't
 * hub-generic, and never overlapping a term door's span. Any failure degrades to [].
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listByMessageMock = vi.fn();
const listAllSightingsMock = vi.fn();
const listAllClaimsMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listByMessage: listByMessageMock, listAll: listAllSightingsMock },
    masteryClaims: { listAll: listAllClaimsMock },
  })),
}));

const ensureTermMarksMock = vi.fn();
vi.mock("./termMarking", () => ({ ensureTermMarks: ensureTermMarksMock }));

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

vi.mock("../stores/diglotStore", () => ({
  useDiglotStore: { getState: () => ({ patchesByMessage: new Map() }) },
}));

vi.mock("../stores/doorStore", () => ({
  useDoorStore: { getState: () => ({ openedNodeIds: new Set() }) },
}));

const { computeDoorPatches } = await import("./conceptDoors");

afterEach(() => {
  listByMessageMock.mockReset();
  listAllSightingsMock.mockReset();
  listAllClaimsMock.mockReset();
  ensureTermMarksMock.mockReset();
});

const thisMessageSighting = {
  id: "s1",
  node_id: "a",
  conversation_id: "c1",
  message_id: "m1",
  created_at: new Date().toISOString(),
};
/** A month-old prior sighting: pre-encounter retention is low, so the door stays eligible. */
const staleSighting = {
  id: "s0",
  node_id: "a",
  conversation_id: "c0",
  message_id: "m0",
  created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
};

describe("computeDoorPatches", () => {
  it("marks an LLM-picked term as the primary door, enriched with a matching node id", async () => {
    ensureTermMarksMock.mockResolvedValueOnce(["闭包"]);
    listByMessageMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。", "c1");
    expect(doors).toHaveLength(1);
    expect(doors[0]).toMatchObject({ original: "闭包", nodeId: "a" });
    expect(ensureTermMarksMock).toHaveBeenCalledWith("message", "m1", "闭包是一个概念。", "c1");
  });

  it("leaves nodeId null for a term-marked word with no matching knowledge node", async () => {
    ensureTermMarksMock.mockResolvedValueOnce(["尾递归"]);
    listByMessageMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "尾递归是一种优化。", "c1");
    expect(doors).toEqual([{ start: 0, end: 3, original: "尾递归", nodeId: null }]);
  });

  it("secondary source: a stale-retention, label-matching sighted node still becomes a door", async () => {
    // Diluted below the hub-frequency threshold (see the overlap test below) so this test
    // isolates the plain secondary-match behavior.
    const dilutingSightings = Array.from({ length: 7 }, (_, index) => ({
      id: `d${index}`,
      node_id: "b",
      conversation_id: `dilute-${index}`,
      message_id: null,
      created_at: staleSighting.created_at,
    }));
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listByMessageMock.mockResolvedValueOnce([thisMessageSighting]);
    listAllSightingsMock.mockResolvedValueOnce([
      staleSighting,
      thisMessageSighting,
      ...dilutingSightings,
    ]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。", "c1");
    expect(doors).toHaveLength(1);
    expect(doors[0]?.nodeId).toBe("a");
  });

  it("never lets a secondary door overlap a primary term door's span", async () => {
    // Dilute node "a"'s conversation coverage well below the hub threshold with unrelated
    // sightings of node "b" in seven other conversations, so this test isolates overlap
    // rejection rather than incidentally hitting the hub-frequency exclusion.
    const dilutingSightings = Array.from({ length: 7 }, (_, index) => ({
      id: `d${index}`,
      node_id: "b",
      conversation_id: `dilute-${index}`,
      message_id: null,
      created_at: staleSighting.created_at,
    }));
    ensureTermMarksMock.mockResolvedValueOnce(["闭包"]);
    listByMessageMock.mockResolvedValueOnce([thisMessageSighting]);
    listAllSightingsMock.mockResolvedValueOnce([
      staleSighting,
      thisMessageSighting,
      ...dilutingSightings,
    ]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。", "c1");
    // Only one door total: the term door already covers "闭包" — the secondary pass for the
    // same node/span is dropped as an overlap, not duplicated.
    expect(doors).toHaveLength(1);
    expect(doors[0]).toMatchObject({ original: "闭包", nodeId: "a" });
  });

  it("excludes a secondary node that recurs in more than 30% of conversations (hub-generic)", async () => {
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listByMessageMock.mockResolvedValueOnce([thisMessageSighting]);
    // Node "a" appears in both distinct conversations sighted anywhere -> 100% coverage.
    listAllSightingsMock.mockResolvedValueOnce([staleSighting, thisMessageSighting]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    expect(await computeDoorPatches("m1", "闭包是一个概念。", "c1")).toEqual([]);
  });

  it("returns empty when nothing is term-marked and there are no sightings", async () => {
    ensureTermMarksMock.mockResolvedValueOnce([]);
    listByMessageMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    expect(await computeDoorPatches("m1", "闭包是一个概念。", "c1")).toEqual([]);
  });

  it("returns empty and never throws when the repo layer fails", async () => {
    listAllSightingsMock.mockRejectedValueOnce(new Error("db locked"));
    listAllClaimsMock.mockResolvedValueOnce([]);
    await expect(computeDoorPatches("m1", "闭包", "c1")).resolves.toEqual([]);
  });

  it("also degrades to empty when the term-marking call itself fails", async () => {
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    ensureTermMarksMock.mockRejectedValueOnce(new Error("llm timeout"));
    await expect(computeDoorPatches("m1", "闭包", "c1")).resolves.toEqual([]);
  });
});
