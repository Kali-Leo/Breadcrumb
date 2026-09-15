/**
 * Purpose: the reranker arrives without any question waiting for it — a download runs behind
 * the turn that asked, a load is waited for once, and an edition without a reranker is asked
 * exactly once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../platform/failureLog", () => ({ degradeSilently: vi.fn() }));
const settings = { networkEnabled: true };
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settings },
}));

const { invoke } = await import("@tauri-apps/api/core");
const { useRerankerStore } = await import("../../stores/rerankerStore");
const { rerankerReady, RERANKER_RETRY_AFTER_MS } = await import("./rerankerReadiness");
const invokeMock = vi.mocked(invoke);

/** A prepare call that resolves when the test says so. */
function deferredPrepare(): { finish(): void } {
  let finish: () => void = () => {};
  const prepared = new Promise<void>((resolve) => {
    finish = resolve;
  });
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "reranker_available") return false;
    if (command === "prepare_reranker") return prepared;
    throw new Error(`unexpected ${command}`);
  });
  return { finish: () => finish() };
}

describe("rerankerReady", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useRerankerStore.setState({ status: "unknown", failedAt: null });
    settings.networkEnabled = true;
  });

  it("starts the download behind the turn and answers this turn without it", async () => {
    const download = deferredPrepare();
    expect(await rerankerReady()).toBe(false);
    expect(useRerankerStore.getState().status).toBe("downloading");
    expect(invokeMock).toHaveBeenCalledWith("prepare_reranker", { allowDownload: true });
    // A second question while it runs asks nothing new.
    expect(await rerankerReady()).toBe(false);
    expect(invokeMock.mock.calls.filter((call) => call[0] === "prepare_reranker")).toHaveLength(1);
    download.finish();
    await vi.waitFor(() => expect(useRerankerStore.getState().status).toBe("ready"));
    expect(await rerankerReady()).toBe(true);
  });

  it("waits for the load when the files are already here", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "reranker_available") return true;
      return undefined;
    });
    expect(await rerankerReady()).toBe(true);
    expect(useRerankerStore.getState().status).toBe("ready");
  });

  it("downloads nothing behind a switched-off network", async () => {
    settings.networkEnabled = false;
    invokeMock.mockResolvedValue(false);
    expect(await rerankerReady()).toBe(false);
    expect(useRerankerStore.getState().status).toBe("failed");
    expect(invokeMock).not.toHaveBeenCalledWith("prepare_reranker", expect.anything());
  });

  it("does not retry a failed download on the very next question", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "reranker_available") return false;
      throw new Error("offline");
    });
    expect(await rerankerReady()).toBe(false);
    await vi.waitFor(() => expect(useRerankerStore.getState().status).toBe("failed"));
    invokeMock.mockClear();
    expect(await rerankerReady()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    useRerankerStore.setState({ failedAt: Date.now() - RERANKER_RETRY_AFTER_MS - 1 });
    await rerankerReady();
    expect(invokeMock).toHaveBeenCalledWith("reranker_available");
  });

  it("asks an edition without a reranker once and never again", async () => {
    invokeMock.mockRejectedValue(new Error("not available in the browser edition"));
    expect(await rerankerReady()).toBe(false);
    expect(useRerankerStore.getState().status).toBe("unavailable");
    invokeMock.mockClear();
    expect(await rerankerReady()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
