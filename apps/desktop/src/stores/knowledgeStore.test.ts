/**
 * Purpose: unit tests for knowledgeStore's per-conversation trail layers — fill-on-first-visit
 * with an instant cached mirror on revisit, no wipe on switch, and a slow load never
 * clobbering the mirror after the user has already switched away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSightingsByConversationMock = vi.fn();
const listAllNodesMock = vi.fn(async () => []);
vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { listByConversation: listSightingsByConversationMock },
    knowledgeNodes: { listAll: listAllNodesMock },
  })),
}));

vi.mock("../lib/knowledgeExtraction", () => ({ extractFromFinishedRound: vi.fn() }));

const chatStateMock = { activeConversationId: null as string | null };
vi.mock("./chatStore", () => ({
  appEventBus: { on: vi.fn(() => () => {}), emit: vi.fn() },
  useChatStore: { getState: () => chatStateMock },
}));

const { useKnowledgeStore } = await import("./knowledgeStore");

function sighting(nodeId: string): { node_id: string } {
  return { node_id: nodeId };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatStateMock.activeConversationId = null;
});

describe("ensureTrailLoaded", () => {
  it("fills on first visit (deduped, in walking order) and serves revisits from cache", async () => {
    chatStateMock.activeConversationId = "fill-1";
    listSightingsByConversationMock.mockResolvedValue([
      sighting("n1"),
      sighting("n2"),
      sighting("n1"),
    ]);
    await useKnowledgeStore.getState().ensureTrailLoaded("fill-1");
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual(["n1", "n2"]);
    expect(listSightingsByConversationMock).toHaveBeenCalledTimes(1);

    listSightingsByConversationMock.mockClear();
    await useKnowledgeStore.getState().ensureTrailLoaded("fill-1");
    expect(listSightingsByConversationMock).not.toHaveBeenCalled();
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual(["n1", "n2"]);
  });

  it("switching conversations re-points the mirror without wiping any layer", async () => {
    chatStateMock.activeConversationId = "keep-1";
    listSightingsByConversationMock.mockResolvedValueOnce([sighting("kept")]);
    await useKnowledgeStore.getState().ensureTrailLoaded("keep-1");
    chatStateMock.activeConversationId = "keep-2";
    listSightingsByConversationMock.mockResolvedValueOnce([sighting("other")]);
    await useKnowledgeStore.getState().ensureTrailLoaded("keep-2");
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual(["other"]);
    expect(useKnowledgeStore.getState().trailByConversation.get("keep-1")).toEqual(["kept"]);
  });

  it("null empties the mirror and resets fresh highlights, layers untouched", async () => {
    await useKnowledgeStore.getState().ensureTrailLoaded(null);
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual([]);
    expect(useKnowledgeStore.getState().freshNodeIds.size).toBe(0);
    expect(listSightingsByConversationMock).not.toHaveBeenCalled();
  });

  it("a slow load fills its layer but never overwrites the mirror after a switch", async () => {
    chatStateMock.activeConversationId = "slow";
    let releaseSlowLoad: (rows: { node_id: string }[]) => void = () => {};
    listSightingsByConversationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSlowLoad = resolve;
        }),
    );
    const slowLoad = useKnowledgeStore.getState().ensureTrailLoaded("slow");

    chatStateMock.activeConversationId = "fast";
    listSightingsByConversationMock.mockResolvedValueOnce([sighting("fast-node")]);
    await useKnowledgeStore.getState().ensureTrailLoaded("fast");
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual(["fast-node"]);

    releaseSlowLoad([sighting("slow-node")]);
    await slowLoad;
    expect(useKnowledgeStore.getState().sessionNodeIds).toEqual(["fast-node"]);
    expect(useKnowledgeStore.getState().trailByConversation.get("slow")).toEqual(["slow-node"]);
  });
});
