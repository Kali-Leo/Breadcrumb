/**
 * Purpose: regression test for the order runDedupSweep writes node_pair_verdicts in. That
 * table is a PERMANENT filter — planLlmTierMerges drops every pair already in it — and the
 * sweep used to write the whole batch of verdicts BEFORE running the merges. A merge that
 * then failed (a concurrent edge insert, a full disk) left the pair marked "judged" forever:
 * never re-merged, never re-judged, the duplicate standing in the tree with nothing but one
 * ai_failures line to show for it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mergeNodeMock = vi.fn();
const recordVerdictMock = vi.fn();
const listAllNodesMock = vi.fn(async () => []);
vi.mock("../platform/db", () => ({
  getRepos: vi.fn(async () => ({
    knowledgeNodes: { listAll: listAllNodesMock },
    nodeEmbeddings: { listAll: vi.fn(async () => []) },
    nodeAliases: { listAll: vi.fn(async () => []) },
    nodePairVerdicts: { listAll: vi.fn(async () => []), record: recordVerdictMock },
    nodeMerge: { mergeNode: mergeNodeMock },
  })),
}));

const recordAiFailureMock = vi.fn();
vi.mock("../platform/failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

vi.mock("../billing/metering", () => ({
  recordMeteredCall: vi.fn(),
  recordFailedCallUsage: vi.fn(),
}));

vi.mock("../platform/llmConfig", () => ({
  llmConfigFrom: vi.fn(() => ({ baseUrl: "u", apiKey: "k", model: "m", fetchImpl: fetch })),
}));

vi.mock("../platform/time", () => ({ newId: () => "id", nowIso: () => "2026-09-04T00:00:00Z" }));

vi.mock("../../stores/chatStore", () => ({ appEventBus: { emit: vi.fn() } }));
vi.mock("../../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ loadTree: vi.fn(async () => undefined) }) },
}));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      featureSwitches: { knowledgeTree: true },
      networkEnabled: true,
      apiConfig: { model: "m" },
    }),
  },
}));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const findSuspectSynonymPairsMock = vi.fn();
vi.mock("@breadcrumb/feature-knowledge-tree", async () => {
  const actual = await vi.importActual<typeof import("@breadcrumb/feature-knowledge-tree")>(
    "@breadcrumb/feature-knowledge-tree",
  );
  return {
    ...actual,
    planMechanicalMerges: () => [],
    findSuspectSynonymPairs: findSuspectSynonymPairsMock,
  };
});

const { runDedupSweep } = await import("./dedupSweep");

function node(id: string, label: string) {
  return { id, parent_id: null, label, summary: "", kind: "concept", created_at: "2026-08-01" };
}

afterEach(() => {
  mergeNodeMock.mockReset();
  recordVerdictMock.mockReset();
  recordAiFailureMock.mockReset();
  chatJsonMock.mockReset();
  findSuspectSynonymPairsMock.mockReset();
  listAllNodesMock.mockReset();
});

/** One "same" pair (a/b) and one "different" pair (c/d), the shape a real batch has. */
function stageTwoPairs(): void {
  listAllNodesMock.mockResolvedValue([
    node("a", "闭包"),
    node("b", "闭包(closure)"),
    node("c", "递归"),
    node("d", "迭代"),
  ] as never);
  findSuspectSynonymPairsMock.mockReturnValue([
    { nodeAId: "a", nodeBId: "b", nodeALabel: "闭包", nodeBLabel: "闭包(closure)" },
    { nodeAId: "c", nodeBId: "d", nodeALabel: "递归", nodeBLabel: "迭代" },
  ]);
  chatJsonMock.mockResolvedValue({
    parsed: {
      verdicts: [
        { pairId: "p0", verdict: "same" },
        { pairId: "p1", verdict: "different" },
      ],
    },
    usage: {},
  });
}

describe("runDedupSweep's verdict cache", () => {
  it("does not mark a pair judged when its merge failed", async () => {
    stageTwoPairs();
    mergeNodeMock.mockRejectedValue(new Error("FOREIGN KEY constraint failed"));

    await runDedupSweep();

    expect(mergeNodeMock).toHaveBeenCalledTimes(1);
    expect(recordAiFailureMock).toHaveBeenCalled();
    const cachedPairs = recordVerdictMock.mock.calls.map((call) => [call[0], call[1]]);
    expect(cachedPairs).not.toContainEqual(["a", "b"]);
    // The answer that WAS paid for and is not in doubt still gets cached, so the sweep does
    // not re-buy it on every startup.
    expect(cachedPairs).toContainEqual(["c", "d"]);
  });

  it("never caches a 'same' — mergeNode deletes those rows inside its own transaction", async () => {
    stageTwoPairs();
    mergeNodeMock.mockResolvedValue(undefined);

    await runDedupSweep();

    expect(mergeNodeMock).toHaveBeenCalledTimes(1);
    const cachedPairs = recordVerdictMock.mock.calls.map((call) => [call[0], call[1]]);
    expect(cachedPairs).toEqual([["c", "d"]]);
    expect(recordVerdictMock.mock.calls[0]?.[2]).toBe("different");
  });

  it("caches every verdict only after the merges have run", async () => {
    stageTwoPairs();
    const order: string[] = [];
    mergeNodeMock.mockImplementation(async () => {
      order.push("merge");
    });
    recordVerdictMock.mockImplementation(async () => {
      order.push("cache");
    });

    await runDedupSweep();

    expect(order).toEqual(["merge", "cache"]);
  });
});
