/**
 * Purpose: unit tests for computeDoorPatches — wires one message's sightings, PRE-encounter
 * mastery/retention (computed excluding this message's own sightings) and the diglot weave's
 * reserved spans into pickDoors, degrading to an empty array on any failure (never throws).
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
  it("marks a stale-retention, label-matching sighted node as a door", async () => {
    listByMessageMock.mockResolvedValueOnce([thisMessageSighting]);
    listAllSightingsMock.mockResolvedValueOnce([staleSighting, thisMessageSighting]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。");
    expect(doors).toHaveLength(1);
    expect(doors[0]?.nodeId).toBe("a");
  });

  it("excludes this message's own sightings from the pre-encounter memory state", async () => {
    // Only sighting is from this very message: without the exclusion the node would look
    // freshly reviewed (retention ~1, lit) and veto its own door.
    listByMessageMock.mockResolvedValueOnce([thisMessageSighting]);
    listAllSightingsMock.mockResolvedValueOnce([thisMessageSighting]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    const doors = await computeDoorPatches("m1", "闭包是一个概念。");
    expect(doors).toHaveLength(1); // never sighted before = most door-worthy
  });

  it("returns empty when this message has no sightings", async () => {
    listByMessageMock.mockResolvedValueOnce([]);
    listAllSightingsMock.mockResolvedValueOnce([]);
    listAllClaimsMock.mockResolvedValueOnce([]);
    expect(await computeDoorPatches("m1", "闭包是一个概念。")).toEqual([]);
  });

  it("returns empty and never throws when the repo layer fails", async () => {
    listByMessageMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(computeDoorPatches("m1", "闭包")).resolves.toEqual([]);
  });
});
