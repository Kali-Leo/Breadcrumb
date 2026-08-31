/**
 * Purpose: regression tests for the edge pipeline's batching (design audit 2026-08-28 #4) —
 * candidate ranking can hand over up to 40 pairs while edgeJudgeSchema accepts at most 20
 * verdicts per reply, so more than 20 pairs MUST become more than one call instead of one
 * oversized call the model silently truncates. Also checks that each judged edge carries the
 * round's source message id into the row, and stores no rationale (the judge is not asked
 * for one — nothing read it, and it was generated after the verdict).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

const listAllNodesMock = vi.fn();
const listAllEmbeddingsMock = vi.fn();
const listAllEdgesMock = vi.fn();
const upsertEdgeMock = vi.fn();
const insertNodeMock = vi.fn();
vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    knowledgeNodes: { listAll: listAllNodesMock, insert: insertNodeMock },
    nodeEmbeddings: { listAll: listAllEmbeddingsMock },
    knowledgeEdges: { listAll: listAllEdgesMock, upsert: upsertEdgeMock },
  })),
}));

vi.mock("../lib/failureLog", () => ({ recordAiFailure: vi.fn() }));
vi.mock("../lib/metering", () => ({
  recordMeteredCall: vi.fn(),
  recordFailedCallUsage: vi.fn(),
}));
vi.mock("../lib/llmConfig", () => ({
  llmConfigFrom: () => ({ baseUrl: "u", apiKey: "k", model: "m", fetchImpl: fetch }),
}));

let idCounter = 0;
vi.mock("../lib/time", () => ({
  newId: () => `id-${++idCounter}`,
  nowIso: () => "2026-08-28T10:00:00.000Z",
}));

type BusHandler = (payload: {
  conversationId: string;
  freshNodeIds: string[];
  touchedNodeIds: string[];
  sourceMessageId: string;
}) => void;
const busHandlers = new Map<string, BusHandler>();
vi.mock("./chatStore", () => ({
  appEventBus: {
    on: (event: string, handler: BusHandler) => {
      busHandlers.set(event, handler);
      return () => busHandlers.delete(event);
    },
    emit: vi.fn(),
  },
}));

vi.mock("./knowledgeStore", () => ({ useKnowledgeStore: { setState: vi.fn() } }));

const settingsState = {
  featureSwitches: { knowledgeEdges: true },
  networkEnabled: true,
  apiConfig: { model: "m" },
  learningMode: "ranked" as const,
};
vi.mock("./settingsStore", () => ({ useSettingsStore: { getState: () => settingsState } }));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

await import("./edgeStore");

afterEach(() => {
  vi.clearAllMocks();
});

function node(id: string, parentId: string | null): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label: `节点${id}`,
    summary: "s",
    kind: "concept",
    created_at: `2026-08-0${(Number(id.replace(/\D/g, "")) % 9) + 1}T00:00:00Z`,
  };
}

/** Drives the store exactly the way the app does: through its bus subscription. */
async function fireRound(freshNodeIds: string[], sourceMessageId = "msg-1"): Promise<void> {
  const handler = busHandlers.get("knowledge:nodesExtracted");
  if (handler === undefined) throw new Error("edgeStore did not subscribe to the bus");
  handler({
    conversationId: "conv-1",
    freshNodeIds,
    touchedNodeIds: freshNodeIds,
    sourceMessageId,
  });
  // The subscription is fire-and-forget; let its promise chain settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("edge extraction batching", () => {
  it("splits more than 20 candidate pairs across several judge calls", async () => {
    // 30 existing siblings + 1 new node, no embeddings -> the fallback path. It is bounded
    // now, so force the >20 case through the ranked path instead by giving every existing
    // node a vector.
    const existing = Array.from({ length: 30 }, (_unused, index) => node(`e${index}`, null));
    const fresh = [node("n0", null), node("n1", null), node("n2", null)];
    listAllNodesMock.mockResolvedValue([...existing, ...fresh]);
    listAllEdgesMock.mockResolvedValue([]);
    // Each new node's landscape has one clear standout plus a crowd; the relative gate keeps
    // several per node, and three new nodes push the total past 20.
    listAllEmbeddingsMock.mockResolvedValue(
      [...existing, ...fresh].map((entry, index) => ({
        node_id: entry.id,
        model: "test",
        vector_json: JSON.stringify(vectorFor(index)),
        created_at: "t",
      })),
    );
    chatJsonMock.mockResolvedValue({
      parsed: { edges: [], methodNodes: [], adjacentConcepts: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await fireRound(["n0", "n1", "n2"]);

    expect(chatJsonMock.mock.calls.length).toBeGreaterThan(1);
    for (const call of chatJsonMock.mock.calls) {
      const userMessage = (call[1] as { role: string; content: string }[]).find(
        (message) => message.role === "user",
      );
      const pairCount = (userMessage?.content.match(/\[p\d+\]/g) ?? []).length;
      expect(pairCount).toBeLessThanOrEqual(20);
      expect(pairCount).toBeGreaterThan(0);
    }
  });

  it("records the round's source message on the edge, and no rationale", async () => {
    const nodes = [node("a", null), node("b", null)];
    listAllNodesMock.mockResolvedValue(nodes);
    listAllEdgesMock.mockResolvedValue([]);
    listAllEmbeddingsMock.mockResolvedValue([
      { node_id: "a", model: "t", vector_json: JSON.stringify([1, 0, 0]), created_at: "t" },
      { node_id: "b", model: "t", vector_json: JSON.stringify([0.9, 0.1, 0]), created_at: "t" },
    ]);
    chatJsonMock.mockResolvedValue({
      parsed: {
        edges: [
          {
            pairId: "p0",
            relation: "requires",
            direction: "aToB",
            weight: null,
            confidence: 0.8,
          },
        ],
        methodNodes: [],
        adjacentConcepts: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await fireRound(["a"], "msg-42");

    expect(upsertEdgeMock).toHaveBeenCalledTimes(1);
    expect(upsertEdgeMock.mock.calls[0]?.[0]).toMatchObject({
      source_message_id: "msg-42",
      reasoning: null,
    });
  });
});

/** Vectors packed into the real model's narrow high-cosine band, with index-mod-4 groups
 * leaning the same way so each node has a handful of standout partners. */
function vectorFor(index: number): number[] {
  const dimensions = 8;
  const base = 1 / Math.sqrt(dimensions);
  const vector = new Array<number>(dimensions).fill(base);
  const axis = index % 4;
  vector[axis] = base + 0.5 + (index % 7) * 0.01;
  return vector;
}
