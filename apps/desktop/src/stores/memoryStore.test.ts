/**
 * Purpose: regression test for the memory store's failure guard (bug hunt 2026-09-03, P0-1).
 * A clock rolled back far enough used to make ts-fsrs throw inside computeNodeMemoryByNode;
 * refresh() had no catch, MapView calls it as a bare `void refresh()`, and the result was an
 * unhandled rejection plus retention/reviewPriority frozen at their empty launch values —
 * a permanently fogged map and no daily helpers. The store must degrade, not stall.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listAllMock = vi.fn();
vi.mock("../lib/platform/db", () => ({
  getRepos: vi.fn(async () => ({ nodeSightings: { listAll: listAllMock } })),
}));

const degradeSilentlyMock = vi.fn(async () => {});
vi.mock("../lib/platform/failureLog", () => ({
  degradeSilently: degradeSilentlyMock,
  recordAiFailure: vi.fn(),
}));

vi.mock("../lib/platform/time", () => ({ nowIso: () => "2026-08-28T10:00:00.000Z" }));
vi.mock("./chatStore", () => ({ appEventBus: { on: vi.fn(), emit: vi.fn() } }));

const { useMemoryStore } = await import("./memoryStore");

beforeEach(() => {
  listAllMock.mockReset();
  degradeSilentlyMock.mockClear();
  useMemoryStore.setState({ retentionByNode: new Map(), reviewPriorityByNode: new Map() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMemoryStore.refresh", () => {
  it("fills both maps from the sightings it reads", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "s1",
        node_id: "n1",
        message_id: "m",
        created_at: "2026-07-01T10:00:00.000Z",
        grade: "good",
      },
    ]);
    await useMemoryStore.getState().refresh();
    expect(useMemoryStore.getState().retentionByNode.size).toBe(1);
    expect(useMemoryStore.getState().reviewPriorityByNode.size).toBe(1);
  });

  it("degrades instead of rejecting when the replay throws", async () => {
    listAllMock.mockRejectedValue(new Error("db is gone"));
    await expect(useMemoryStore.getState().refresh()).resolves.toBeUndefined();
    expect(degradeSilentlyMock).toHaveBeenCalledWith("memory-refresh", expect.any(Error));
  });

  it("keeps the previous maps when a refresh fails, rather than blanking the map", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "s1",
        node_id: "n1",
        message_id: "m",
        created_at: "2026-07-01T10:00:00.000Z",
        grade: "good",
      },
    ]);
    await useMemoryStore.getState().refresh();
    const before = useMemoryStore.getState().retentionByNode;
    listAllMock.mockRejectedValue(new Error("clock went backwards"));
    await useMemoryStore.getState().refresh();
    expect(useMemoryStore.getState().retentionByNode).toBe(before);
  });
});
