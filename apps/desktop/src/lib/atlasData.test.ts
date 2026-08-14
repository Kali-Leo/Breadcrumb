/**
 * Purpose: unit tests for loadAtlas — wires this conversation's sightings, the global edge
 * library, node labels, and retention into buildExplorationAtlas, and degrades to null on
 * any failure (never throws).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const listByConversationMock = vi.fn();
const listAllEdgesMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listByConversation: listByConversationMock },
    knowledgeEdges: { listAll: listAllEdgesMock },
  })),
}));

vi.mock("../stores/knowledgeStore", () => ({
  useKnowledgeStore: {
    getState: () => ({
      nodes: [
        { id: "a", label: "闭包", summary: "", parent_id: null, kind: "concept", created_at: "t" },
        {
          id: "b",
          label: "作用域",
          summary: "",
          parent_id: null,
          kind: "concept",
          created_at: "t",
        },
      ],
    }),
  },
}));

vi.mock("../stores/memoryStore", () => ({
  useMemoryStore: {
    getState: () => ({ retentionByNode: new Map([["a", 0.9]]) }),
  },
}));

const { loadAtlas } = await import("./atlasData");

afterEach(() => {
  listByConversationMock.mockReset();
  listAllEdgesMock.mockReset();
});

describe("loadAtlas", () => {
  it("builds the atlas from this conversation's sightings and the global edge library", async () => {
    listByConversationMock.mockResolvedValueOnce([
      {
        id: "s1",
        node_id: "a",
        conversation_id: "c1",
        message_id: "m1",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "s2",
        node_id: "b",
        conversation_id: "c1",
        message_id: "m2",
        created_at: "2026-01-01T00:01:00Z",
      },
    ]);
    listAllEdgesMock.mockResolvedValueOnce([
      {
        id: "e1",
        source_id: "a",
        target_id: "b",
        edge_type: "requires",
        weight: 1,
        confidence: 1,
        origin: "llm",
        created_at: "t",
      },
    ]);

    const atlas = await loadAtlas("c1");
    expect(atlas).not.toBeNull();
    expect(atlas?.trail.map((node) => node.label)).toEqual(["闭包", "作用域"]);
    expect(atlas?.structure).toHaveLength(1);
    expect(atlas?.staleness.map((node) => node.nodeId)).toEqual(["b"]);
  });

  it("returns null and never throws when the repo layer fails", async () => {
    listByConversationMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(loadAtlas("c1")).resolves.toBeNull();
  });
});
